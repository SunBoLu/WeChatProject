const app = getApp();

Page({
  data: {
    userInfo: {},
    isLoggedIn: false,
    userRoleText: '点击登录/注册',
    userStats: {
      demandCount: 0,
      orderCount: 0,
      rating: '--'
    },
    serviceRecords: [],
    unreadCount: 0,
    showEditModal: false,
    editAddress: '',
    editPhone: '',
    editQrCodeUploaded: false
  },

  onShow: function() {
    this.checkLoginStatus();

    if (this.data.isLoggedIn) {
      this.loadUserData();
    } else {
      wx.hideLoading();
    }
  },

  onLoad: function() {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
  },

  checkLoginStatus: function() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      if (userInfo.role === 'admin') {
        wx.reLaunch({
          url: '/pages/admin/admin-home'
        });
        return;
      }

      this.setData({
        userInfo: userInfo,
        isLoggedIn: true,
        userRoleText: userInfo.role === 'demander' ? '需求方' : '服务方'
      });
    } else {
      this.setData({
        userInfo: {},
        isLoggedIn: false,
        userRoleText: '点击登录/注册'
      });
    }
  },

  loadUserData: function() {
    const that = this;
    app.refreshUserInfo().then(function(updatedUser) {
      if (updatedUser) {
        that.setData({ userInfo: updatedUser });
      }
      that._computeStats();
    }).catch(function() {
      that._computeStats();
    });
  },

  _computeStats: function() {
    const userInfo = this.data.userInfo;
    const userRole = userInfo.role;
    const userId = userInfo.user_id;
    const allDemands = app.globalData.mockDemands || [];

    let userStats = {};

    if (userRole === 'demander') {
      const myDemands = allDemands.filter(function(demand) {
        return demand.publisherId === userId;
      });
      userStats.demandCount = myDemands.length;
      userStats.orderCount = myDemands.filter(function(demand) {
        return demand.status !== 'pending';
      }).length;
    } else {
      userStats.demandCount = 0;

      const myOrders = allDemands.filter(function(demand) {
        return demand.acceptedById === userId;
      });
      userStats.orderCount = myOrders.length;

      const completedOrders = myOrders.filter(function(demand) {
        return demand.status === 'completed' || demand.status === 'paid' || demand.status === 'rated';
      });

      if (completedOrders.length > 0) {
        const userRatings = app.globalData.userRatings || [];
        const serviceProviderRatings = userRatings.filter(function(rating) {
          return rating.serviceProviderId === userId;
        });

        if (serviceProviderRatings.length > 0) {
          const totalRating = serviceProviderRatings.reduce(function(sum, rating) {
            return sum + rating.rating;
          }, 0);
          userStats.rating = (totalRating / serviceProviderRatings.length).toFixed(1);
        } else {
          userStats.rating = '3.0';
        }
      } else {
        userStats.rating = '3.0';
      }
    }

    let serviceRecords = [];
    if (userRole === 'serviceProvider') {
      serviceRecords = allDemands
        .filter(function(demand) {
          return demand.acceptedById === userId &&
            (demand.status === 'completed' || demand.status === 'paid' || demand.status === 'rated');
        })
        .map(function(demand) {
          return {
            id: demand.id,
            title: demand.title,
            type: demand.type,
            createdAt: demand.createdAt,
            status: demand.status
          };
        })
        .slice(0, 3);
    } else {
      serviceRecords = allDemands
        .filter(function(demand) {
          return demand.publisherId === userId &&
            (demand.status === 'completed' || demand.status === 'paid' || demand.status === 'rated');
        })
        .map(function(demand) {
          return {
            id: demand.id,
            title: demand.title,
            type: demand.type,
            createdAt: demand.createdAt,
            status: demand.status
          };
        })
        .slice(0, 3);
    }

    const unreadCount = app.getUnreadMessageCount(userId);

    this.setData({
      userStats: userStats,
      serviceRecords: serviceRecords,
      unreadCount: unreadCount
    }, function() {
      wx.hideLoading();
    });
  },

  navigateToAuth: function() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    });
  },

  logout: function() {
    wx.showModal({
      title: '确认退出',
      content: '您确定要退出登录吗？',
      success: function(res) {
        if (res.confirm) {
          app.globalData.userInfo = null;
          wx.removeStorageSync('userInfo');

          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 1000,
            success: function() {
              setTimeout(function() {
                wx.reLaunch({
                  url: '/pages/auth/auth'
                });
              }, 1000);
            }
          });
        }
      }
    });
  },

  navigateToDemands: function() {
    if (!this.data.isLoggedIn) {
      this.navigateToAuth();
      return;
    }

    wx.navigateTo({
      url: '/pages/demands/demands'
    });
  },

  navigateToPendingOrders: function() {
    if (!this.data.isLoggedIn) {
      this.navigateToAuth();
      return;
    }

    if (this.data.userInfo.role === 'demander') {
      wx.navigateTo({
        url: '/pages/pending/pending'
      });
    } else {
      wx.navigateTo({
        url: '/pages/accepted/accepted'
      });
    }
  },

  navigateToOngoingOrders: function() {
    if (!this.data.isLoggedIn) {
      this.navigateToAuth();
      return;
    }

    wx.navigateTo({
      url: '/pages/ongoing/ongoing'
    });
  },

  navigateToCompletedOrders: function() {
    if (!this.data.isLoggedIn) {
      this.navigateToAuth();
      return;
    }

    wx.navigateTo({
      url: '/pages/completed/completed'
    });
  },

  showServiceGuarantee: function() {
    wx.navigateTo({
      url: '/pages/feedback/feedback'
    });
  },

  showHelpCenter: function() {
    wx.navigateTo({
      url: '/pages/report/report'
    });
  },

  navigateToNearbyProviders: function() {
    wx.navigateTo({
      url: '/pages/provider-list/provider-list'
    });
  },

  callCustomerService: function() {
    wx.makePhoneCall({
      phoneNumber: '4001234567',
      fail: function() {
        wx.showToast({
          title: '拨打电话失败',
          icon: 'none'
        });
      }
    });
  },

  showEditModal: function() {
    const userInfo = this.data.userInfo;
    this.setData({
      showEditModal: true,
      editAddress: userInfo.address || '',
      editPhone: userInfo.phone || '',
      editQrCodeUploaded: userInfo.payment_qr_code ? true : (userInfo.qr_code_uploaded || false)
    });
  },

  hideEditModal: function() {
    this.setData({ showEditModal: false });
  },

  onEditAddressInput: function(e) {
    this.setData({ editAddress: e.detail.value });
  },

  onEditPhoneInput: function(e) {
    this.setData({ editPhone: e.detail.value });
  },

  onUploadQrCode: function() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        that.setData({ editQrCodeUploaded: true });
        wx.showToast({ title: '收款码已选择', icon: 'success' });
      }
    });
  },

  saveEditInfo: function() {
    const data = {
      address: this.data.editAddress
    };

    if (this.data.userInfo.role === 'serviceProvider') {
      data.phone = this.data.editPhone;
      if (this.data.editQrCodeUploaded) {
        data.qr_code_uploaded = true;
      }
    }

    const that = this;
    app.updateUserInfo(data).then(function(updated) {
      that.setData({
        userInfo: updated,
        showEditModal: false
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    }).catch(function() {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  getTagClass: function(type) {
    switch (type) {
      case 'installation':
        return 'tag-primary';
      case 'repair':
        return 'tag-secondary';
      case 'cleaning':
        return 'tag-success';
      default:
        return 'tag-primary';
    }
  },

  getTagText: function(type) {
    switch (type) {
      case 'installation':
        return '安装';
      case 'repair':
        return '维修';
      case 'cleaning':
        return '清洗';
      default:
        return '服务';
    }
  },

  formatDate: function(dateString) {
    return app.formatDate(dateString);
  }
});