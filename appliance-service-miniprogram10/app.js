import { orderApi, userApi, adminApi, messageApi, feedbackApi, reportApi, serviceProviderApi, settingsApi } from './utils/api';

App({
  globalData: {
    userInfo: null
  },

  onLaunch: function () {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.globalData.userInfo = userInfo;
    }
  },

  isNewUser: function() {
    const userInfo = this.globalData.userInfo;
    if (!userInfo) return true;
    return userInfo.is_first_login === true || userInfo.is_first_login === 'true';
  },

  needInfoCollection: function() {
    const userInfo = this.globalData.userInfo;
    if (!userInfo) return false;
    return userInfo.info_collected !== true && userInfo.info_collected !== 'true';
  },

  login: function(phone, code, role, wechatUserInfo) {
    return new Promise((resolve, reject) => {
      let isAdmin = false;

      if (phone) {
        adminApi.getAdmins()
          .then(admins => {
            const adminUser = admins.find(admin => admin.phone === phone);
            if (adminUser) {
              isAdmin = true;
              const userInfo = {
                ...adminUser,
                user_id: adminUser.user_id,
                updatedAt: new Date().toISOString()
              };
              this.globalData.userInfo = userInfo;
              wx.setStorageSync('userInfo', userInfo);
              resolve(userInfo);
            } else {
              this._loginOrCreateUser(phone, wechatUserInfo, role, isAdmin, resolve, reject);
            }
          })
          .catch(err => {
            this._loginOrCreateUser(phone, wechatUserInfo, role, isAdmin, resolve, reject);
          });
      } else if (wechatUserInfo) {
        this._loginOrCreateUser(phone, wechatUserInfo, role, isAdmin, resolve, reject);
      } else {
        wx.getUserProfile({
          desc: '用于完善用户资料',
          success: res => {
            this._loginOrCreateUser(phone, res.userInfo, role, isAdmin, resolve, reject);
          },
          fail: err => {
            reject(err);
          }
        });
      }
    });
  },

  _loginOrCreateUser: function(phone, wechatUserInfo, role, isAdmin, resolve, reject) {
    if (wechatUserInfo) {
      userApi.createUser({
        phone: phone || '',
        name: wechatUserInfo.nickName || '微信用户',
        avatar: wechatUserInfo.avatarUrl || '',
        role: isAdmin ? 'admin' : (role || 'demander'),
        openid: wechatUserInfo.openId || ''
      })
      .then(user => {
        const userInfo = {
          ...user,
          user_id: user.user_id
        };
        this.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);
        resolve(userInfo);
      })
      .catch(err => reject(err));
    } else if (phone) {
      userApi.createUser({
        phone: phone,
        name: '用户' + phone.slice(-4),
        avatar: '',
        role: isAdmin ? 'admin' : (role || 'demander'),
        openid: ''
      })
      .then(user => {
        const userInfo = {
          ...user,
          user_id: user.user_id
        };
        this.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);
        resolve(userInfo);
      })
      .catch(err => reject(err));
    }
  },

  register: function(phone, code, password, role) {
    return userApi.createUser({
      phone: phone,
      name: '用户' + phone.slice(-4),
      avatar: '',
      role: role || 'demander',
      openid: ''
    }).then(user => {
      const userInfo = {
        ...user,
        user_id: user.user_id
      };
      this.globalData.userInfo = userInfo;
      wx.setStorageSync('userInfo', userInfo);
      return userInfo;
    });
  },

  markFirstLoginDone: function() {
    const userInfo = this.globalData.userInfo;
    if (!userInfo) return Promise.resolve();
    return userApi.updateUser(userInfo.user_id, { is_first_login: false }).then(updated => {
      this.globalData.userInfo = updated;
      wx.setStorageSync('userInfo', updated);
      return updated;
    });
  },

  saveUserInfo: function(data) {
    const userInfo = this.globalData.userInfo;
    if (!userInfo) return Promise.reject(new Error('未登录'));
    return userApi.updateUser(userInfo.user_id, { ...data, info_collected: true }).then(updated => {
      this.globalData.userInfo = updated;
      wx.setStorageSync('userInfo', updated);
      return updated;
    });
  },

  updateUserInfo: function(data) {
    const userInfo = this.globalData.userInfo;
    if (!userInfo) return Promise.reject(new Error('未登录'));
    return userApi.updateUser(userInfo.user_id, data).then(updated => {
      this.globalData.userInfo = updated;
      wx.setStorageSync('userInfo', updated);
      return updated;
    });
  },

  refreshUserInfo: function() {
    const userInfo = this.globalData.userInfo;
    if (!userInfo) return Promise.resolve(null);
    return userApi.getUser(userInfo.user_id).then(user => {
      this.globalData.userInfo = user;
      wx.setStorageSync('userInfo', user);
      return user;
    });
  },

  getDemandDetail: function(demandId) {
    if (!demandId) return null;
    return orderApi.getOrderDetail(demandId);
  },

  publishDemand: function(demandData) {
    return orderApi.createOrder({
      title: demandData.title,
      description: demandData.description,
      serviceType: demandData.serviceType,
      applianceType: demandData.applianceType,
      address: demandData.address,
      contactName: demandData.contactName,
      contactPhone: demandData.contactPhone,
      publisherId: this.globalData.userInfo.user_id,
      latitude: demandData.latitude,
      longitude: demandData.longitude
    });
  },

  acceptDemand: function(demandId) {
    const userId = this.globalData.userInfo.user_id;
    return orderApi.updateOrder(demandId, {
      status: 'accepted',
      acceptedById: userId
    });
  },

  setFinalAmount: function(demandId, finalAmount) {
    return orderApi.updateOrder(demandId, {
      finalAmount: finalAmount,
      status: 'in_service'
    });
  },

  startService: function(demandId) {
    return orderApi.updateOrder(demandId, { status: 'in_service' });
  },

  completeService: function(demandId) {
    return orderApi.updateOrder(demandId, { status: 'completed' });
  },

  payService: function(demandId, amount) {
    return orderApi.updateOrder(demandId, { status: 'paid' });
  },

  rateService: function(demandId, rating, comment) {
    return orderApi.updateOrder(demandId, { status: 'rated' });
  },

  getUserRatings: function(userId) {
    return [];
  },

  calculateUserRating: function(userId) {
    return 3.0;
  },

  verifyPayment: function(orderId) {
    return orderApi.verifyPayment(orderId);
  },

  getSuperAdminQrCode: function() {
    return adminApi.getQrCode('admin_1');
  },

  sendMessage: function(senderId, receiverId, content, orderId, imageUrl) {
    return messageApi.sendMessage({
      senderId: senderId,
      receiverId: receiverId,
      content: content,
      orderId: orderId,
      imageUrl: imageUrl || null,
      type: imageUrl ? 'image' : 'chat'
    });
  },

  getChatMessages: function(orderId, userId) {
    return messageApi.getMessages({ orderId, userId });
  },

  markMessagesAsRead: function(orderId, readerId) {
    return messageApi.markAsRead(orderId, readerId);
  },

  getOrderMessages: function(orderId) {
    return messageApi.getMessages({ orderId });
  },

  deleteOrder: function(orderId) {
    return orderApi.deleteOrder(orderId);
  },

  warnUser: function(userId, reason) {
    return userApi.getUser(userId).then(user => {
      const newCount = (user.warning_count || 0) + 1;
      return userApi.updateUser(userId, {
        warning_count: newCount,
        is_banned: newCount >= 3
      });
    });
  },

  getUnreadMessageCount: function(userId) {
    return 0;
  },

  getFeedbacks: function() {
    return feedbackApi.getFeedbacks();
  },

  getReports: function() {
    return reportApi.getReports();
  },

  updateFeedbackStatus: function(feedbackId, status) {
    return feedbackApi.updateFeedback(feedbackId, {
      status: status,
      processedBy: this.globalData.userInfo.user_id
    });
  },

  updateReportStatus: function(reportId, status) {
    return reportApi.updateReport(reportId, {
      status: status,
      processedBy: this.globalData.userInfo.user_id
    });
  },

  addWarning: function(userId, reason) {
    return userApi.getUser(userId)
      .then(user => {
        return userApi.updateUser(userId, {
          warning_count: (user.warning_count || 0) + 1,
          is_banned: (user.warning_count || 0) + 1 >= 3
        });
      });
  },

  isUserBanned: function(userId) {
    return userApi.getUser(userId)
      .then(user => user && user.is_banned);
  },

  getUserWarningCount: function(userId) {
    return userApi.getUser(userId)
      .then(user => user && user.warning_count ? user.warning_count : 0);
  },

  unbanUser: function(userId) {
    return userApi.updateUser(userId, {
      is_banned: false,
      warning_count: 0
    });
  },

  addAdmin: function(phone, name) {
    return adminApi.addAdmin({
      phone: phone,
      name: name || '管理员'
    });
  },

  getAdminUsers: function() {
    return adminApi.getAdmins();
  },

  isAdmin: function(userId) {
    const user = this.globalData.userInfo;
    return user && user.role === 'admin';
  },

  deleteAdmin: function(adminId) {
    return adminApi.deleteAdmin(adminId);
  },

  getUsers: function(params) {
    return userApi.getUsers(params);
  },

  getServiceProviders: function(latitude, longitude, radius) {
    return serviceProviderApi.getProviders({ latitude, longitude, radius });
  },

  sendNotification: function(userId, title, content) {
    wx.showToast({
      title: title + ': ' + content,
      icon: 'none',
      duration: 2000
    });
  },

  getUserMessages: function(userId) {
    return messageApi.getMessages({ userId });
  },

  markMessageAsRead: function(messageId) {
    return new Promise((resolve, reject) => {
      reject(new Error('功能待实现'));
    });
  },

  calculateDistance: function(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
  },

  toRad: function(deg) {
    return deg * (Math.PI/180);
  },

  formatDate: function(dateString) {
    if (!dateString) {
      return '未知时间';
    }

    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return '未知时间';
    }

    const now = new Date();
    const diff = now - date;

    if (diff < 60 * 60 * 1000 && diff >= 0) {
      const minutes = Math.floor(diff / (60 * 1000));
      return (minutes > 0 ? minutes : '刚刚') + (minutes > 0 ? '分钟前' : '');
    } else if (diff < 24 * 60 * 60 * 1000 && diff >= 0) {
      return Math.floor(diff / (60 * 60 * 1000)) + '小时前';
    } else if (diff < 48 * 60 * 60 * 1000 && diff >= 0) {
      return '昨天';
    } else if (diff < 7 * 24 * 60 * 60 * 1000 && diff >= 0) {
      return Math.floor(diff / (24 * 60 * 60 * 1000)) + '天前';
    } else {
      return date.getFullYear() + '-' +
             String(date.getMonth() + 1).padStart(2, '0') + '-' +
             String(date.getDate()).padStart(2, '0');
    }
  }
});