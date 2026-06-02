-- 用户表
CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(50) PRIMARY KEY,
  phone VARCHAR(20),
  name VARCHAR(100),
  avatar VARCHAR(500),
  role VARCHAR(20) DEFAULT 'demander',
  openid VARCHAR(100),
  location VARCHAR(200),
  address VARCHAR(500),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  payment_qr_code TEXT,
  qr_code_uploaded BOOLEAN DEFAULT false,
  info_collected BOOLEAN DEFAULT false,
  is_first_login BOOLEAN DEFAULT true,
  is_banned BOOLEAN DEFAULT false,
  warning_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  service_type VARCHAR(50),
  appliance_type VARCHAR(50),
  address VARCHAR(500),
  contact_name VARCHAR(100),
  contact_phone VARCHAR(20),
  budget VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  publisher_id VARCHAR(50) REFERENCES users(user_id),
  accepted_by_id VARCHAR(50) REFERENCES users(user_id),
  prepayment_amount DECIMAL(10,2) DEFAULT 50,
  final_amount DECIMAL(10,2) DEFAULT 0,
  commission_rate DECIMAL(5,2) DEFAULT 15.00,
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 管理员表
CREATE TABLE IF NOT EXISTS admin_users (
  user_id VARCHAR(50) PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  name VARCHAR(100),
  role VARCHAR(20) DEFAULT 'admin',
  payment_qr_code TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(50) PRIMARY KEY,
  sender_id VARCHAR(50) REFERENCES users(user_id),
  receiver_id VARCHAR(50) REFERENCES users(user_id),
  order_id VARCHAR(50) REFERENCES orders(id),
  content TEXT,
  image_url VARCHAR(500),
  type VARCHAR(20) DEFAULT 'chat',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 平台设置表
CREATE TABLE IF NOT EXISTS platform_settings (
  id VARCHAR(50) PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 反馈表
CREATE TABLE IF NOT EXISTS feedbacks (
  id VARCHAR(50) PRIMARY KEY,
  demander_id VARCHAR(50) REFERENCES users(user_id),
  service_provider_id VARCHAR(50) REFERENCES users(user_id),
  content TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  processed_by VARCHAR(50)
);

-- 举报表
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(50) PRIMARY KEY,
  reporter_id VARCHAR(50) REFERENCES users(user_id),
  demander_id VARCHAR(50) REFERENCES users(user_id),
  order_id VARCHAR(50) REFERENCES orders(id),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  processed_by VARCHAR(50)
);

-- 插入默认管理员
INSERT INTO admin_users (user_id, phone, name, role, created_at) 
VALUES ('admin_1', '13800138000', '管理员', 'admin', NOW())
ON CONFLICT (user_id) DO NOTHING;
