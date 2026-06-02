const API_BASE_URL = 'https://appliance-service-api.onrender.com';

const request = (url, method, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE_URL + url,
      method: method,
      data: data,
      success: (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(res.data);
        } else {
          reject(new Error(res.data.error || '请求失败'));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

export const orderApi = {
  getOrders: () => request('/orders', 'GET'),
  getOrderDetail: (orderId) => request(`/orders/${orderId}`, 'GET'),
  createOrder: (orderData) => request('/orders', 'POST', orderData),
  updateOrder: (orderId, orderData) => request(`/orders/${orderId}`, 'PUT', orderData),
  deleteOrder: (orderId) => request(`/orders/${orderId}`, 'DELETE'),
  verifyPayment: (orderId) => request(`/orders/${orderId}/verify-payment`, 'POST')
};

export const userApi = {
  getUsers: (params = {}) => {
    const query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    return request(`/users${query ? '?' + query : ''}`, 'GET');
  },
  createUser: (userData) => request('/users', 'POST', userData),
  getUser: (userId) => request(`/users/${userId}`, 'GET'),
  updateUser: (userId, userData) => request(`/users/${userId}`, 'PUT', userData)
};

export const serviceProviderApi = {
  getProviders: (params = {}) => {
    const query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    return request(`/service-providers${query ? '?' + query : ''}`, 'GET');
  }
};

export const adminApi = {
  getAdmins: () => request('/admins', 'GET'),
  addAdmin: (adminData) => request('/admins', 'POST', adminData),
  deleteAdmin: (userId) => request(`/admins/${userId}`, 'DELETE'),
  setQrCode: (userId, paymentQrCode) => request(`/admins/${userId}/qrcode`, 'PUT', { paymentQrCode }),
  getQrCode: (userId) => request(`/admins/${userId}/qrcode`, 'GET')
};

export const messageApi = {
  getMessages: (params = {}) => {
    const query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    return request(`/messages${query ? '?' + query : ''}`, 'GET');
  },
  sendMessage: (messageData) => request('/messages', 'POST', messageData),
  markAsRead: (orderId, readerId) => request('/messages/read', 'PUT', { orderId, readerId })
};

export const uploadApi = {
  uploadImage: (imageData, fileName) => request('/upload', 'POST', { imageData, fileName })
};

export const settingsApi = {
  getSetting: (key) => request(`/settings/${key}`, 'GET'),
  updateSetting: (key, value, adminId) => request(`/settings/${key}`, 'PUT', { value, adminId })
};

export const feedbackApi = {
  getFeedbacks: () => request('/feedbacks', 'GET'),
  submitFeedback: (feedbackData) => request('/feedbacks', 'POST', feedbackData),
  updateFeedback: (feedbackId, feedbackData) => request(`/feedbacks/${feedbackId}`, 'PUT', feedbackData)
};

export const reportApi = {
  getReports: () => request('/reports', 'GET'),
  submitReport: (reportData) => request('/reports', 'POST', reportData),
  updateReport: (reportId, reportData) => request(`/reports/${reportId}`, 'PUT', reportData)
};
