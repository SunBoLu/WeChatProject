const adminApi = require('../../utils/api').adminApi;
const app = getApp();

Page({
  data: {
    adminUsers: [],
    currentAdmin: {},
    isSuperAdmin: false,
    adminPhone: '',
    adminName: '',
    orderCount: 0,
    userCount: 0,
    qrCodeImage: ''
  },

  onLoad: function() {
    if (!app.isAdmin(app.globalData.userInfo.user_id)) {
      wx.showToast({
        title: '无权限访问',
        icon: 'none',
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    this.loadData(true);
  },

  loadData: function(showLoadingFlag) {
    if (showLoadingFlag) {
      wx.showLoading({ title: '加载中...', mask: true });
    }

    app.getAdminUsers()
      .then(adminUsers => {
        const currentUser = app.globalData.userInfo;
        const currentAdmin = (adminUsers || []).find(admin => admin.phone === currentUser.phone) || currentUser;
        const isSuperAdmin = currentAdmin.user_id === 'admin_1';

        const orderCount = (app.globalData.orders || []).length;

        app.getUsers({}).then(users => {
          const userCount = (users || []).length;
          this.setData({
            adminUsers: adminUsers || [],
            currentAdmin: currentAdmin,
            isSuperAdmin: isSuperAdmin,
            orderCount: orderCount,
            userCount: userCount
          });

          if (showLoadingFlag) wx.hideLoading();
        }).catch(() => {
          this.setData({
            adminUsers: adminUsers || [],
            currentAdmin: currentAdmin,
            isSuperAdmin: isSuperAdmin,
            orderCount: orderCount,
            userCount: 0
          });
          if (showLoadingFlag) wx.hideLoading();
        });

        if (isSuperAdmin) {
          app.getSuperAdminQrCode().then(res => {
            this.setData({ qrCodeImage: res.paymentQrCode || res.payment_qr_code || '' });
          }).catch(() => {});
        }
      })
      .catch(err => {
        const currentUser = app.globalData.userInfo;
        this.setData({
          adminUsers: [],
          currentAdmin: currentUser,
          isSuperAdmin: currentUser.user_id === 'admin_1',
          orderCount: 0,
          userCount: 0
        });
        if (showLoadingFlag) wx.hideLoading();
      });
  },

  bindAdminPhoneInput: function(e) {
    this.setData({ adminPhone: e.detail.value });
  },

  bindAdminNameInput: function(e) {
    this.setData({ adminName: e.detail.value });
  },

  validatePhone: function(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
  },

  addAdmin: function() {
    const { adminPhone, adminName } = this.data;

    if (!adminPhone) {
      wx.showToast({ title: '请输入管理员手机号', icon: 'none' });
      return;
    }
    if (!this.validatePhone(adminPhone)) {
      wx.showToast({ title: '请输入正确的手机号格式', icon: 'none' });
      return;
    }
    if (!adminName) {
      wx.showToast({ title: '请输入管理员姓名', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '添加中...', mask: true });
    app.addAdmin(adminPhone, adminName)
      .then(result => {
        wx.hideLoading();
        wx.showToast({ title: '添加成功', icon: 'success', duration: 2000 });
        this.setData({ adminPhone: '', adminName: '' });
        this.loadData();
      })
      .catch(error => {
        wx.hideLoading();
        wx.showToast({ title: error.message || '添加失败', icon: 'none' });
      });
  },

  deleteAdmin: function(e) {
    const adminId = e.currentTarget.dataset.adminId;
    wx.showModal({
      title: '删除管理员',
      content: '确定要删除这个管理员吗？删除后无法恢复。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true });
          app.deleteAdmin(adminId)
            .then(result => {
              wx.hideLoading();
              wx.showToast({ title: '删除成功', icon: 'success', duration: 2000 });
              this.loadData();
            })
            .catch(error => {
              wx.hideLoading();
              wx.showToast({ title: error.message || '删除失败', icon: 'none' });
            });
        }
      }
    });
  },

  uploadQrCode: function() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中...', mask: true });

        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: tempFilePath,
          encoding: 'base64',
          success: (fileRes) => {
            const base64Data = 'data:image/png;base64,' + fileRes.data;
            adminApi.setQrCode('admin_1', base64Data)
              .then(() => {
                wx.hideLoading();
                wx.showToast({ title: '二维码上传成功', icon: 'success' });
                this.setData({ qrCodeImage: base64Data });
              })
              .catch(err => {
                wx.hideLoading();
                wx.showToast({ title: '上传失败', icon: 'none' });
              });
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '读取图片失败', icon: 'none' });
          }
        });
      }
    });
  },

  logout: function() {
    wx.showModal({
      title: '确认退出',
      content: '您确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.userInfo = null;
          wx.removeStorageSync('userInfo');
          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 1000,
            success: () => {
              setTimeout(() => {
                wx.reLaunch({ url: '/pages/auth/auth' });
              }, 1000);
            }
          });
        }
      }
    });
  },

  switchToHome: function() {
    wx.redirectTo({ url: '/pages/admin/admin-home' });
  },

  switchToFeedback: function() {
    wx.redirectTo({ url: '/pages/admin/feedback-manage' });
  },

  switchToProfile: function() {},

  switchToUserManage: function() {
    wx.navigateTo({ url: '/pages/admin/user-manage' });
  },

  formatDate: function(dateString) {
    return app.formatDate(dateString);
  }
});