// publish.js
const app = getApp();

Page({
  data: {
    serviceType: 'installation',
    applianceType: 'air-conditioner',
    title: '',
    description: '',
    contactName: '',
    contactPhone: '',
    address: '',
    selectedAddress: '',
    showPaymentModal: false,
    paymentQrCode: '',
    currentOrderId: '',
    paying: false
  },

  onShow: function() {
    if (!app.globalData.userInfo) {
      wx.navigateTo({
        url: '/pages/auth/auth'
      });
      return;
    }

    if (app.globalData.userInfo.role === 'provider') {
      wx.showToast({
        title: '服务方不可发布需求',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/home/home'
        });
      }, 2000);
      return;
    }
  },

  onServiceTypeChange: function(e) {
    const serviceType = e.detail.value;
    this.setData({ serviceType: serviceType });
    this.generateTitle();
  },

  onApplianceTypeChange: function(e) {
    const applianceType = e.detail.value;
    this.setData({ applianceType: applianceType });
    this.generateTitle();
  },

  generateTitle: function() {
    const { serviceType, applianceType } = this.data;

    const serviceTypeMap = {
      'installation': '安装',
      'repair': '维修',
      'cleaning': '清洗'
    };

    const applianceTypeMap = {
      'air-conditioner': '空调',
      'refrigerator': '冰箱',
      'washing-machine': '洗衣机',
      'tv': '电视',
      'water-heater': '热水器',
      'range-hood': '油烟机',
      'other': '其他家电'
    };

    const serviceTypeName = serviceTypeMap[serviceType] || '';
    const applianceTypeName = applianceTypeMap[applianceType] || '';

    if (serviceTypeName && applianceTypeName) {
      this.setData({ title: `${applianceTypeName}${serviceTypeName}` });
    }
  },

  onTitleInput: function(e) {
    this.setData({ title: e.detail.value });
  },

  onDescriptionInput: function(e) {
    this.setData({ description: e.detail.value });
  },

  onContactNameInput: function(e) {
    this.setData({ contactName: e.detail.value });
  },

  onContactPhoneInput: function(e) {
    this.setData({ contactPhone: e.detail.value });
  },

  onAddressInput: function(e) {
    const fieldName = e.currentTarget.dataset.name || 'selectedAddress';
    this.setData({
      [fieldName]: e.detail.value,
      address: e.detail.value
    });
  },

  chooseLocation: function() {
    const that = this;

    wx.chooseLocation({
      success: function(res) {
        let address = '';
        if (res.address) {
          address = res.address;
        } else if (res.name) {
          address = res.name;
        } else if (res.addressStr) {
          address = res.addressStr;
        }

        if (address) {
          that.setData({
            address: address,
            selectedAddress: address
          });
          wx.showToast({
            title: '地址选择成功',
            icon: 'success'
          });
        } else {
          wx.showToast({
            title: '获取地址信息失败',
            icon: 'none'
          });
        }
      },
      fail: function() {
        wx.showToast({
          title: '获取位置失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  getCurrentLocation: function() {
    wx.getLocation({
      type: 'wgs84',
      success: res => {
        wx.chooseLocation({
          latitude: res.latitude,
          longitude: res.longitude,
          success: chooseRes => {
            this.setData({ address: chooseRes.address });
          },
          fail: () => {
            wx.showToast({
              title: '获取位置失败',
              icon: 'none'
            });
          }
        });
      },
      fail: () => {
        wx.showToast({
          title: '获取位置失败，请检查位置权限',
          icon: 'none'
        });
      }
    });
  },

  publishDemand: function(e) {
    const { serviceType, applianceType, title, description, contactName, contactPhone, address } = this.data;

    if (!title) {
      wx.showToast({ title: '请输入需求标题', icon: 'none' });
      return;
    }

    if (!description) {
      wx.showToast({ title: '请输入需求描述', icon: 'none' });
      return;
    }

    if (!contactName) {
      wx.showToast({ title: '请输入联系人姓名', icon: 'none' });
      return;
    }

    if (!contactPhone) {
      wx.showToast({ title: '请输入联系电话', icon: 'none' });
      return;
    }

    if (!/^1[3-9]\d{9}$/.test(contactPhone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    if (!address) {
      wx.showToast({ title: '请输入服务地址', icon: 'none' });
      return;
    }

    const demandData = {
      serviceType,
      applianceType,
      title,
      description,
      contactName,
      contactPhone,
      address
    };

    wx.showLoading({ title: '创建订单中...', mask: true });

    app.publishDemand(demandData)
      .then(order => {
        wx.hideLoading();
        const orderId = order.id || order.order_id || order._id;

        this.setData({
          currentOrderId: orderId,
          showPaymentModal: true,
          paymentQrCode: ''
        });

        app.getSuperAdminQrCode()
          .then(result => {
            const qrCode = result.payment_qr_code || result.paymentQrCode || result.qrCode || '';
            this.setData({ paymentQrCode: qrCode });
          })
          .catch(() => {
            this.setData({ paymentQrCode: '' });
          });
      })
      .catch(error => {
        wx.hideLoading();
        wx.showToast({
          title: error.message || '创建订单失败',
          icon: 'none'
        });
      });
  },

  closePaymentModal: function() {
    this.setData({
      showPaymentModal: false,
      paymentQrCode: '',
      currentOrderId: ''
    });
  },

  confirmPayment: function() {
    if (this.data.paying) return;

    const { currentOrderId } = this.data;
    if (!currentOrderId) {
      wx.showToast({ title: '订单信息异常，请重试', icon: 'none' });
      return;
    }

    this.setData({ paying: true });

    app.verifyPayment(currentOrderId)
      .then(() => {
        this.setData({
          showPaymentModal: false,
          paymentQrCode: '',
          currentOrderId: '',
          paying: false
        });

        this.setData({
          serviceType: 'installation',
          applianceType: 'air-conditioner',
          title: '',
          description: '',
          contactName: '',
          contactPhone: '',
          address: '',
          selectedAddress: ''
        }, () => {
          wx.pageScrollTo({ scrollTop: 0, duration: 300 });
        });

        wx.showToast({
          title: '支付验证成功，订单发布成功',
          icon: 'success',
          duration: 2000,
          success: () => {
            setTimeout(() => {
              wx.switchTab({ url: '/pages/home/home' });
            }, 2000);
          }
        });
      })
      .catch(error => {
        this.setData({ paying: false });
        wx.showToast({
          title: error.message || '支付验证失败，请重试',
          icon: 'none'
        });
      });
  }
});