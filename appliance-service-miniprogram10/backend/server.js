const express = require('express');
const { Pool } = require('pg');
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
  }
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
  const { status, acceptedById, finalAmount, paymentStatus } = req.body;
  try {
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
      params.push(finalAmount);
    }
    if (paymentStatus !== undefined) {
      query += `, payment_status = $${paramIndex++}`;
      params.push(paymentStatus);
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await pool.query(query, params);
    if (!result.rows[0]) return res.status(404).json({ error: '订单不存在' });
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
    const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
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
    let query = 'SELECT * FROM messages WHERE 1=1';
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

    query += ' ORDER BY created_at ASC';
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
    res.json(result.rows);
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