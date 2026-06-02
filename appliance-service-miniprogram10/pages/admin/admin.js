// admin.js
const app = getApp();

Page({
  data: {
    orders: [],
    adminUsers: [],
    adminPhone: '',
    adminName: ''
  },

  onLoad: function() {
    // 显示加载动画
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    
    // 检查是否为管理员
    if (!app.isAdmin(app.globalData.userInfo.userId)) {
      wx.hideLoading();
      wx.showToast({
        title: '无权限访问',
        icon: 'none',
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }
    
    // 加载数据
    this.loadData();
  },

  // 加载数据
  loadData: function() {
    // 加载订单列表
    const orders = app.globalData.orders || [];
    
    // 加载管理员列表
    const adminUsers = app.getAdminUsers();
    
    this.setData({
      orders: orders,
      adminUsers: adminUsers
    }, () => {
      wx.hideLoading();
    });
  },

  // 绑定管理员手机号输入
  bindAdminPhoneInput: function(e) {
    this.setData({
      adminPhone: e.detail.value
    });
  },

  // 绑定管理员姓名输入
  bindAdminNameInput: function(e) {
    this.setData({
      adminName: e.detail.value
    });
  },

  // 添加管理员
  addAdmin: function() {
    const { adminPhone, adminName } = this.data;
    
    // 验证输入
    if (!adminPhone) {
      wx.showToast({
        title: '请输入管理员手机号',
        icon: 'none'
      });
      return;
    }
    
    if (!adminName) {
      wx.showToast({
        title: '请输入管理员姓名',
        icon: 'none'
      });
      return;
    }
    
    // 显示加载动画
    wx.showLoading({
      title: '添加中...',
      mask: true
    });
    
    // 添加管理员
    app.addAdmin(adminPhone, adminName)
      .then(result => {
        wx.hideLoading();
        wx.showToast({
          title: result.message,
          icon: 'success',
          duration: 2000,
          success: () => {
            // 清空输入
            this.setData({
              adminPhone: '',
              adminName: ''
            });
            // 重新加载管理员列表
            this.loadData();
          }
        });
      })
      .catch(error => {
        wx.hideLoading();
        wx.showToast({
          title: error.message || '添加失败',
          icon: 'none'
        });
      });
  },

  // 删除订单
  deleteOrder: function(e) {
    const orderId = e.currentTarget.dataset.orderId;
    
    // 显示确认弹窗
    wx.showModal({
      title: '删除订单',
      content: '确定要删除这个订单吗？删除后无法恢复。',
      success: (res) => {
        if (res.confirm) {
          // 显示加载动画
          wx.showLoading({
            title: '删除中...',
            mask: true
          });
          
          // 删除订单
          app.deleteOrder(orderId)
            .then(result => {
              wx.hideLoading();
              wx.showToast({
                title: result.message,
                icon: 'success',
                duration: 2000,
                success: () => {
                  // 重新加载订单列表
                  this.loadData();
                }
              });
            })
            .catch(error => {
              wx.hideLoading();
              wx.showToast({
                title: error.message || '删除失败',
                icon: 'none'
              });
            });
        }
      }
    });
  },

  // 获取订单状态文本
  getStatusText: function(status) {
    const statusMap = {
      pending: '等待接单',
      accepted: '已接单',
      in_service: '服务中',
      completed: '服务完成',
      paid: '已支付',
      rated: '已评价'
    };
    return statusMap[status] || status;
  },

  // 格式化日期
  formatDate: function(dateString) {
    return app.formatDate(dateString);
  },

  // 退出登录
  logout: function() {
    wx.showModal({
      title: '确认退出',
      content: '您确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除用户信息
          app.globalData.userInfo = null;
          wx.removeStorageSync('userInfo');
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 1000,
            success: () => {
              // 跳转到登录页面
              setTimeout(() => {
                wx.navigateTo({
                  url: '/pages/auth/auth'
                });
              }, 1000);
            }
          });
        }
      }
    });
  }
});