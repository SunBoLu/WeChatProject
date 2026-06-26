const express = require('express');
const { Pool } = require('pg');
const cron = require('node-cron');
require('dotenv').config();
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'appliance-service-secret-key-12!';
const ENCRYPTION_IV = process.env.ENCRYPTION_IV || '1234567890123456';

if (Buffer.from(ENCRYPTION_KEY).length !== 32) {
  console.error('WARNING: ENCRYPTION_KEY must be exactly 32 bytes (32 ASCII chars). Current length:', Buffer.from(ENCRYPTION_KEY).length);
}
if (Buffer.from(ENCRYPTION_IV).length !== 16) {
  console.error('WARNING: ENCRYPTION_IV must be exactly 16 bytes (16 ASCII chars). Current length:', Buffer.from(ENCRYPTION_IV).length);
}
const SUPER_ADMIN_ID = 'admin_1';

function encrypt(text) {
  if (!text) return null;
  try {
    const key = Buffer.from(ENCRYPTION_KEY);
    const iv = Buffer.from(ENCRYPTION_IV);
    if (key.length !== 32) return null;
    if (iv.length !== 16) return null;
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  } catch (e) {
    console.error('encrypt error:', e.message);
    return null;
  }
}

function decrypt(encrypted) {
  if (!encrypted) return null;
  try {
    const key = Buffer.from(ENCRYPTION_KEY);
    const iv = Buffer.from(ENCRYPTION_IV);
    if (key.length !== 32) return null;
    if (iv.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return null;
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  min: 2,
  idleTimeoutMillis: 60 * 1000,
  connectionTimeoutMillis: 10 * 1000
});

// ==================== 数据库 & 服务保活系统 ====================
// 三级保活策略：轻量心跳 + 业务保活 + 深度保活
// 目标：防止免费数据库（Supabase/Render 等）因长时间无活动被暂停

const keepAliveStats = {
  heartbeatCount: 0,
  businessCount: 0,
  deepCount: 0,
  lastHeartbeat: null,
  lastBusiness: null,
  lastDeep: null,
  consecutiveFailures: 0,
  lastError: null
};

/**
 * 一级保活：轻量心跳
 * 执行 SELECT 1，几乎零开销，用于刷新连接池 idle 状态
 */
async function heartbeatPing() {
  const tag = '[keep-alive::heartbeat]';
  const start = Date.now();
  try {
    const result = await pool.query('SELECT 1 AS ping');
    const ok = result && result.rows && result.rows[0];
    const elapsed = Date.now() - start;
    if (ok) {
      keepAliveStats.heartbeatCount++;
      keepAliveStats.lastHeartbeat = new Date().toISOString();
      keepAliveStats.consecutiveFailures = 0;
      console.log(`${tag} OK (${elapsed}ms) #${keepAliveStats.heartbeatCount}`);
      return { ok: true, elapsedMs: elapsed };
    }
    console.warn(`${tag} 查询返回为空 (${elapsed}ms)`);
    return { ok: false, elapsedMs: elapsed, error: 'empty result' };
  } catch (err) {
    keepAliveStats.consecutiveFailures++;
    keepAliveStats.lastError = err.message;
    const elapsed = Date.now() - start;
    console.error(`${tag} FAIL (${elapsed}ms) 连续失败: ${keepAliveStats.consecutiveFailures}, 错误: ${err.message}`);
    return { ok: false, elapsedMs: elapsed, error: err.message };
  }
}

/**
 * 二级保活：业务级查询
 * 执行"真实"的业务查询（读取订单、用户各1条），让数据库判定为有实际活动
 * 比纯 SELECT 1 更能触发数据库的"活跃"判定
 */
async function businessKeepAlive() {
  const tag = '[keep-alive::business]';
  const start = Date.now();
  try {
    const results = await Promise.allSettled([
      pool.query('SELECT id, status FROM orders ORDER BY created_at DESC LIMIT 1'),
      pool.query('SELECT user_id, role FROM users ORDER BY created_at DESC LIMIT 1'),
      pool.query('SELECT COUNT(*) as cnt FROM messages')
    ]);

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const elapsed = Date.now() - start;
    const allOk = successCount === results.length;

    if (allOk) {
      keepAliveStats.businessCount++;
      keepAliveStats.lastBusiness = new Date().toISOString();
      keepAliveStats.consecutiveFailures = 0;
      console.log(`${tag} OK (${elapsed}ms) 查询成功 ${successCount}/${results.length}，本次为第 ${keepAliveStats.businessCount} 次`);
    } else {
      console.warn(`${tag} PARTIAL (${elapsed}ms) 成功 ${successCount}/${results.length}`);
    }

    return { ok: allOk, elapsedMs: elapsed, successCount, total: results.length };
  } catch (err) {
    keepAliveStats.consecutiveFailures++;
    keepAliveStats.lastError = err.message;
    const elapsed = Date.now() - start;
    console.error(`${tag} FAIL (${elapsed}ms) 错误: ${err.message}`);
    return { ok: false, elapsedMs: elapsed, error: err.message };
  }
}

/**
 * 三级保活：深度保活（轻量写入）
 * 对 platform_settings 表做一次 UPSERT 心跳记录
 * 用于防止某些数据库"只读不算活跃"的判定
 * 频率控制：每天1次，避免不必要的写入
 */
async function deepKeepAlive() {
  const tag = '[keep-alive::deep]';
  const start = Date.now();
  try {
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO platform_settings (id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET setting_value = $3, updated_at = $4`,
      ['setting_heartbeat', 'heartbeat', JSON.stringify({ last_ping: now, count: keepAliveStats.deepCount + 1 }), now]
    );

    const elapsed = Date.now() - start;
    keepAliveStats.deepCount++;
    keepAliveStats.lastDeep = now;
    keepAliveStats.consecutiveFailures = 0;
    console.log(`${tag} OK (${elapsed}ms) 第 ${keepAliveStats.deepCount} 次深度保活`);
    return { ok: true, elapsedMs: elapsed };
  } catch (err) {
    keepAliveStats.consecutiveFailures++;
    keepAliveStats.lastError = err.message;
    const elapsed = Date.now() - start;
    console.warn(`${tag} SKIP (${elapsed}ms) 写入失败（可能表不存在），错误: ${err.message}`);
    return { ok: false, elapsedMs: elapsed, error: err.message };
  }
}

/**
 * 连接池健康检查
 * 检查当前连接池状态，避免连接泄漏
 */
function getPoolStatus() {
  return {
    totalCount: pool.totalCount || 0,
    idleCount: pool.idleCount || 0,
    waitingCount: pool.waitingCount || 0
  };
}

// ------- 定时任务配置（Asia/Shanghai 时区） -------
// cron 格式：秒 分 时 日 月 星期

// 一级保活：每 4 小时一次轻量心跳
// 时间：00:00, 04:00, 08:00, 12:00, 16:00, 20:00
const heartbeatTask = cron.schedule('0 0 */4 * * *', () => {
  heartbeatPing();
}, {
  scheduled: true,
  timezone: 'Asia/Shanghai'
});

// 二级保活：每天 4 次业务查询
// 时间：09:00, 13:00, 17:00, 21:00（覆盖白天活跃时段）
const businessTask = cron.schedule('0 0 9,13,17,21 * * *', () => {
  businessKeepAlive();
}, {
  scheduled: true,
  timezone: 'Asia/Shanghai'
});

// 三级保活：每天 1 次深度保活（凌晨 3 点，低峰期）
const deepTask = cron.schedule('0 0 3 * * *', () => {
  deepKeepAlive();
}, {
  scheduled: true,
  timezone: 'Asia/Shanghai'
});

// 服务启动时执行完整保活流程
console.log('[keep-alive] 保活系统启动，正在执行首次保活...');
heartbeatPing().then(() => {
  return businessKeepAlive();
}).then(() => {
  console.log('[keep-alive] 首次保活完成，定时任务已注册');
  console.log('[keep-alive] 心跳: 每4小时 | 业务保活: 每日4次 | 深度保活: 每日1次');
});

// ------- 健康检查接口 -------
app.get('/api/health', async (req, res) => {
  const start = Date.now();
  const heartbeat = await heartbeatPing();
  const poolStatus = getPoolStatus();
  const elapsed = Date.now() - start;

  const memoryUsage = process.memoryUsage();
  const uptimeSeconds = process.uptime();

  res.json({
    status: heartbeat.ok ? 'ok' : 'error',
    service: 'appliance-backend',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(uptimeSeconds),
    db_ping_ms: heartbeat.elapsedMs,
    pool: poolStatus,
    memory: {
      rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024)
    },
    keepalive: {
      heartbeat_count: keepAliveStats.heartbeatCount,
      business_count: keepAliveStats.businessCount,
      deep_count: keepAliveStats.deepCount,
      last_heartbeat: keepAliveStats.lastHeartbeat,
      last_business: keepAliveStats.lastBusiness,
      last_deep: keepAliveStats.lastDeep,
      consecutive_failures: keepAliveStats.consecutiveFailures,
      last_error: keepAliveStats.lastError
    }
  });
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('连接数据库失败', err.stack);
  }
  console.log('成功连接到 Supabase PostgreSQL');
  release();

  // 确保 users 表有 warning_history 字段
  pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_history JSONB DEFAULT \'[]\'::jsonb')
    .then(() => console.log('已确保 warning_history 字段存在'))
    .catch(e => console.log('warning_history 字段检查跳过:', e.message));
});

app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取订单失败' });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: '订单不存在' });
    const order = result.rows[0];

    let publisher = null;
    let provider = null;
    if (order.publisher_id) {
      const pubResult = await pool.query(
        'SELECT user_id, phone, name, avatar, role, address, location, latitude, longitude, payment_qr_code, info_collected FROM users WHERE user_id = $1',
        [order.publisher_id]
      );
      publisher = pubResult.rows[0] || null;
      if (publisher && publisher.payment_qr_code) {
        publisher.payment_qr_code = decrypt(publisher.payment_qr_code);
      }
    }
    if (order.accepted_by_id) {
      const provResult = await pool.query(
        'SELECT user_id, phone, name, avatar, role, address, location, latitude, longitude, payment_qr_code, info_collected FROM users WHERE user_id = $1',
        [order.accepted_by_id]
      );
      provider = provResult.rows[0] || null;
      if (provider && provider.payment_qr_code) {
        provider.payment_qr_code = decrypt(provider.payment_qr_code);
      }
    }

    res.json({ ...order, publisher, provider });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取订单详情失败' });
  }
});

app.post('/api/orders', async (req, res) => {
  const { title, description, serviceType, applianceType, address, contactName, contactPhone, publisherId, latitude, longitude } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO orders (id, title, description, service_type, appliance_type, address, contact_name, contact_phone, publisher_id, status, prepayment_amount, final_amount, commission_rate, payment_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 50, 0, 15.00, $11, NOW(), NOW()) RETURNING *',
      ['order_' + Date.now(), title, description, serviceType, applianceType, address, contactName, contactPhone, publisherId, 'pending', 'pending']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建订单失败' });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { status, acceptedById, finalAmount, paymentStatus, rating, comment } = req.body;
  try {
    // 先查出订单信息（用于状态变更后的系统通知）
    const orderRes = await pool.query('SELECT publisher_id, title FROM orders WHERE id = $1', [id]);
    const existingOrder = orderRes.rows[0];

    let query = 'UPDATE orders SET updated_at = NOW()';
    const params = [];
    let paramIndex = 1;

    if (status !== undefined) {
      query += `, status = $${paramIndex++}`;
      params.push(status);
    }
    if (acceptedById !== undefined) {
      query += `, accepted_by_id = $${paramIndex++}`;
      params.push(acceptedById);
    }
    if (finalAmount !== undefined) {
      query += `, final_amount = $${paramIndex++}`;
      params.push(Number(finalAmount));
    }
    if (paymentStatus !== undefined) {
      query += `, payment_status = $${paramIndex++}`;
      params.push(paymentStatus);
    }
    if (rating !== undefined) {
      query += `, rating = $${paramIndex++}`;
      params.push(Number(rating));
    }
    if (comment !== undefined) {
      query += `, comment = $${paramIndex++}`;
      params.push(String(comment));
    }
    if (rating !== undefined) {
      query += `, rated_at = NOW()`;
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await pool.query(query, params);
    if (!result.rows[0]) return res.status(404).json({ error: '订单不存在' });

    // 状态变为 accepted 且设置了接单服务方 → 给需求方发系统通知
    // 注意：sender_id 用服务方真实 user_id（避免外键约束，type='system' 标识系统通知
    if (status === 'accepted' && acceptedById && existingOrder && existingOrder.publisher_id) {
      try {
        const provResult = await pool.query('SELECT name FROM users WHERE user_id = $1', [acceptedById]);
        const providerName = (provResult.rows[0] && provResult.rows[0].name) || '服务方';
        const orderTitle = existingOrder.title || '需求';
        const sysContent = `您发布的需求「${orderTitle}」已被服务方「${providerName}」接单，请尽快沟通服务细节。`;

        await pool.query(
          'INSERT INTO messages (id, sender_id, receiver_id, content, type, order_id, image_url, is_read, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())',
          ['sys_' + Date.now(), acceptedById, existingOrder.publisher_id, sysContent, 'system', id, null]
        );
      } catch (notifyErr) {
        console.error('发送接单通知失败', notifyErr);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新订单失败' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    res.json({ success: true, message: '订单删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除订单失败' });
  }
});

app.post('/api/users', async (req, res) => {
  const { phone, name, avatar, role, openid } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (user_id, phone, name, avatar, role, openid, location, is_first_login, info_collected, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, NOW(), NOW()) RETURNING *',
      ['user_' + Date.now(), phone, name, avatar, role || 'demander', openid, '北京市朝阳区']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建用户失败' });
  }
});

app.get('/api/users/find', async (req, res) => {
  const { phone, openid } = req.query;
  try {
    let query = 'SELECT * FROM users WHERE ';
    const params = [];
    const conditions = [];
    let idx = 1;

    if (phone) {
      conditions.push(`phone = $${idx++}`);
      params.push(phone);
    }
    if (openid) {
      conditions.push(`openid = $${idx++}`);
      params.push(openid);
    }

    if (conditions.length === 0) {
      return res.status(400).json({ error: '请提供手机号或 openid' });
    }

    query += conditions.join(' OR ');
    query += ' ORDER BY created_at DESC LIMIT 1';

    const result = await pool.query(query, params);
    if (!result.rows[0]) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const user = result.rows[0];
    if (user.is_banned) {
      return res.status(403).json({ error: '账号已被禁用，警告次数达到上限', is_banned: true });
    }
    if (user.payment_qr_code) {
      user.payment_qr_code = decrypt(user.payment_qr_code);
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查找用户失败' });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    let result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    if (!result.rows[0]) {
      result = await pool.query('SELECT * FROM admin_users WHERE user_id = $1', [userId]);
    }
    if (!result.rows[0]) return res.status(404).json({ error: '用户不存在' });
    const user = result.rows[0];
    if (user.payment_qr_code) {
      user.payment_qr_code = decrypt(user.payment_qr_code);
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

app.get('/api/users/:userId/rating', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      'SELECT rating FROM orders WHERE accepted_by_id = $1 AND rating IS NOT NULL AND rating > 0',
      [userId]
    );
    if (result.rows.length === 0) {
      res.json({ average: null, count: 0 });
      return;
    }
    const ratings = result.rows.map(r => Number(r.rating));
    const sum = ratings.reduce((acc, val) => acc + val, 0);
    const average = sum / ratings.length;
    res.json({ average: Number(average.toFixed(1)), count: ratings.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取评分失败' });
  }
});

app.put('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, avatar, role, is_banned, warning_count, warning_history, address, phone, latitude, longitude, payment_qr_code, info_collected, is_first_login } = req.body;
  try {
    const fields = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
    if (avatar !== undefined) { fields.push(`avatar = $${idx++}`); params.push(avatar); }
    if (role !== undefined) { fields.push(`role = $${idx++}`); params.push(role); }
    if (is_banned !== undefined) { fields.push(`is_banned = $${idx++}`); params.push(is_banned); }
    if (warning_count !== undefined) { fields.push(`warning_count = $${idx++}`); params.push(warning_count); }
    if (warning_history !== undefined) { fields.push(`warning_history = $${idx++}`); params.push(JSON.stringify(warning_history)); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); params.push(phone); }
    if (address !== undefined) { fields.push(`address = $${idx++}`); params.push(address); }
    if (latitude !== undefined) { fields.push(`latitude = $${idx++}`); params.push(latitude); }
    if (longitude !== undefined) { fields.push(`longitude = $${idx++}`); params.push(longitude); }
    if (payment_qr_code !== undefined) {
      fields.push(`payment_qr_code = $${idx++}`);
      params.push(encrypt(payment_qr_code));
      fields.push(`qr_code_uploaded = $${idx++}`);
      params.push(true);
    }
    if (info_collected !== undefined) { fields.push(`info_collected = $${idx++}`); params.push(info_collected); }
    if (is_first_login !== undefined) { fields.push(`is_first_login = $${idx++}`); params.push(is_first_login); }

    fields.push(`updated_at = NOW()`);
    params.push(userId);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE user_id = $${idx} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: '用户不存在' });
    const user = result.rows[0];
    if (user.payment_qr_code) user.payment_qr_code = decrypt(user.payment_qr_code);
    res.json(user);
  } catch (err) {
    console.error('更新用户信息失败:', err.message || err);
    res.status(500).json({ error: '更新用户信息失败: ' + (err.message || '未知错误') });
  }
});

app.get('/api/service-providers', async (req, res) => {
  const { latitude, longitude, radius } = req.query;
  try {
    const result = await pool.query(
      `SELECT user_id, name, avatar, role, address, latitude, longitude, created_at
       FROM users WHERE role = 'serviceProvider' AND info_collected = true AND is_banned = false`
    );
    let providers = result.rows;

    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const r = parseFloat(radius) || 50;

      providers = providers.filter(p => {
        if (!p.latitude || !p.longitude) return false;
        const dLat = (p.latitude - lat) * Math.PI / 180;
        const dLon = (p.longitude - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(p.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return 6371 * c <= r;
      });

      providers.forEach(p => {
        const dLat = (p.latitude - lat) * Math.PI / 180;
        const dLon = (p.longitude - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(p.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        p.distance = Math.round(6371 * c * 10) / 10;
      });

      providers.sort((a, b) => a.distance - b.distance);
    }

    res.json(providers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取服务方列表失败' });
  }
});

app.get('/api/admins', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM admin_users');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取管理员列表失败' });
  }
});

app.post('/api/admins', async (req, res) => {
  const { phone, name } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO admin_users (user_id, phone, name, role, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      ['admin_' + Date.now(), phone, name || '管理员', 'admin']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '添加管理员失败' });
  }
});

app.delete('/api/admins/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    if (userId === SUPER_ADMIN_ID) {
      return res.status(400).json({ error: '不能删除超级管理员' });
    }
    await pool.query('DELETE FROM admin_users WHERE user_id = $1', [userId]);
    res.json({ success: true, message: '管理员删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除管理员失败' });
  }
});

app.get('/api/messages', async (req, res) => {
  const { userId, orderId } = req.query;
  try {
    let query = `
      SELECT m.*, s.name as sender_name, r.name as receiver_name
      FROM messages m
      LEFT JOIN users s ON m.sender_id = s.user_id
      LEFT JOIN users r ON m.receiver_id = r.user_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (orderId) {
      query += ` AND order_id = $${idx++}`;
      params.push(orderId);
    }
    if (userId) {
      query += ` AND (sender_id = $${idx} OR receiver_id = $${idx})`;
      params.push(userId);
      idx++;
    }

    query += ' ORDER BY m.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取消息失败' });
  }
});

app.post('/api/messages', async (req, res) => {
  const { senderId, receiverId, content, type, orderId, imageUrl } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO messages (id, sender_id, receiver_id, content, type, order_id, image_url, is_read, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW()) RETURNING *',
      ['msg_' + Date.now(), senderId, receiverId, content || '', type || 'chat', orderId || null, imageUrl || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '发送消息失败' });
  }
});

app.put('/api/messages/read', async (req, res) => {
  const { orderId, readerId } = req.body;
  try {
    await pool.query(
      'UPDATE messages SET is_read = true WHERE order_id = $1 AND receiver_id = $2 AND is_read = false',
      [orderId, readerId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '标记已读失败' });
  }
});

// 统计未读消息数
app.get('/api/messages/unread', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: '缺少 userId 参数' });
  }
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false',
      [userId]
    );
    const count = parseInt(result.rows[0].count, 10) || 0;
    res.json({ count: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '统计未读消息失败' });
  }
});

app.post('/api/upload', async (req, res) => {
  const { imageData, fileName } = req.body;
  if (!imageData) {
    return res.status(400).json({ error: '缺少图片数据' });
  }
  try {
    const fileId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    res.json({ success: true, fileId, url: imageData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '上传失败' });
  }
});

app.get('/api/settings/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const result = await pool.query('SELECT * FROM platform_settings WHERE setting_key = $1', [key]);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取设置失败' });
  }
});

app.put('/api/settings/:key', async (req, res) => {
  const { key } = req.params;
  const { value, adminId } = req.body;
  try {
    if (adminId !== SUPER_ADMIN_ID) {
      return res.status(403).json({ error: '仅超级管理员可修改平台设置' });
    }
    const settingId = 'setting_' + key;
    const result = await pool.query(
      'UPSERT INTO platform_settings (id, setting_key, setting_value, updated_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [settingId, key, value]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新设置失败' });
  }
});

app.put('/api/admins/:userId/qrcode', async (req, res) => {
  const { userId } = req.params;
  const { paymentQrCode } = req.body;
  try {
    if (userId !== SUPER_ADMIN_ID) {
      const adminCheck = await pool.query('SELECT * FROM admin_users WHERE user_id = $1 AND role = $2', [userId, 'admin']);
      if (!adminCheck.rows[0] && userId !== SUPER_ADMIN_ID) {
        return res.status(403).json({ error: '仅超级管理员可设置收款二维码' });
      }
    }
    const result = await pool.query(
      'UPDATE admin_users SET payment_qr_code = $1 WHERE user_id = $2 RETURNING *',
      [encrypt(paymentQrCode), userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '管理员不存在' });
    const admin = result.rows[0];
    if (admin.payment_qr_code) admin.payment_qr_code = decrypt(admin.payment_qr_code);
    res.json(admin);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新收款二维码失败' });
  }
});

app.get('/api/admins/:userId/qrcode', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query('SELECT payment_qr_code FROM admin_users WHERE user_id = $1', [userId]);
    if (!result.rows[0]) return res.status(404).json({ error: '管理员不存在' });
    const qrCode = decrypt(result.rows[0].payment_qr_code);
    res.json({ payment_qr_code: qrCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取收款二维码失败' });
  }
});

app.post('/api/orders/:id/verify-payment', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE orders SET payment_status = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      ['paid', 'pending', id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '订单不存在' });
    res.json({ success: true, message: '支付验证成功，订单发布成功', order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '支付验证失败' });
  }
});

app.get('/api/users', async (req, res) => {
  const { role, keyword } = req.query;
  try {
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let idx = 1;

    if (role && role !== 'all') {
      query += ` AND role = $${idx++}`;
      params.push(role);
    }
    if (keyword) {
      query += ` AND (name ILIKE $${idx} OR phone ILIKE $${idx})`;
      params.push(`%${keyword}%`);
      idx++;
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    let users = result.rows;

    // 如果没有指定 role 过滤，同时获取管理员用户（用于管理页名称解析）
    if (!role || role === 'all') {
      const adminResult = await pool.query('SELECT * FROM admin_users');
      const adminUsers = adminResult.rows.map(admin => ({
        ...admin,
        role: admin.role || 'admin'
      }));
      const existingIds = new Set(users.map(u => u.user_id));
      adminUsers.forEach(admin => {
        if (!existingIds.has(admin.user_id)) {
          users.push(admin);
        }
      });
    }

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

app.get('/api/feedbacks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM feedbacks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取反馈列表失败' });
  }
});

app.post('/api/feedbacks', async (req, res) => {
  const { demanderId, serviceProviderId, content } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO feedbacks (id, demander_id, service_provider_id, content, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      ['feedback_' + Date.now(), demanderId, serviceProviderId, content, 'pending']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '提交反馈失败' });
  }
});

app.put('/api/feedbacks/:id', async (req, res) => {
  const { id } = req.params;
  const { status, processedBy } = req.body;
  try {
    const result = await pool.query(
      'UPDATE feedbacks SET status = $1, processed_at = NOW(), processed_by = $2 WHERE id = $3 RETURNING *',
      [status, processedBy, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新反馈状态失败' });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reports ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取举报列表失败' });
  }
});

app.post('/api/reports', async (req, res) => {
  const { reporterId, demanderId, orderId, reason } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO reports (id, reporter_id, demander_id, order_id, reason, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      ['report_' + Date.now(), reporterId, demanderId, orderId, reason, 'pending']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '提交举报失败' });
  }
});

app.put('/api/reports/:id', async (req, res) => {
  const { id } = req.params;
  const { status, processedBy } = req.body;
  try {
    const result = await pool.query(
      'UPDATE reports SET status = $1, processed_at = NOW(), processed_by = $2 WHERE id = $3 RETURNING *',
      [status, processedBy, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新举报状态失败' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});