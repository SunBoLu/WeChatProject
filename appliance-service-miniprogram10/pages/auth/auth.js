const app = getApp();

Page({
  data: {
    showWelcome: false,
    showInfoCollect: false,
    phone: '',
    code: '',
    role: 'demander',
    codeBtnText: '获取验证码',
    countdown: 0,
    infoAddress: '',
    infoPhone: '',
    infoQrCode: '',
    collectStep: 'address'
  },

  _verificationCode: '',

  onLoad: function() {
    const appInstance = getApp();
    if (appInstance.globalData.userInfo) {
      this.checkAndShowPopups();
    }
  },

  checkAndShowPopups: function() {
    if (app.isNewUser()) {
      this.setData({ showWelcome: true });
    } else if (app.needInfoCollection()) {
      this.setData({ showInfoCollect: true });
    }
  },

  closeWelcome: function() {
    this.setData({ showWelcome: false });
    app.markFirstLoginDone().then(() => {
      this.setData({ showInfoCollect: true });
    }).catch(() => {
      this.setData({ showInfoCollect: true });
    });
  },

  onPhoneInput: function(e) {
    this.setData({ phone: e.detail.value });
  },

  onCodeInput: function(e) {
    this.setData({ code: e.detail.value });
  },

  onRoleChange: function(e) {
    this.setData({ role: e.detail.value });
  },

  sendCode: function() {
    const { phone } = this.data;
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    this._verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    wx.showToast({
      title: `验证码已发送，测试验证码：${this._verificationCode}`,
      icon: 'success'
    });
    this.startCountdown();
  },

  startCountdown: function() {
    let countdown = 60;
    this.setData({ countdown: countdown, codeBtnText: `${countdown}秒后重新获取` });
    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        this.setData({ countdown: 0, codeBtnText: '获取验证码' });
      } else {
        this.setData({ countdown: countdown, codeBtnText: `${countdown}秒后重新获取` });
      }
    }, 1000);
  },

  login: function() {
    wx.showToast({ title: '请使用微信注册登录，手机号注册正在加入中', icon: 'none', duration: 2000 });
  },

  wechatLogin: function() {
    const { role } = this.data;
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        app.login('', '', role, res.userInfo)
          .then(() => {
            wx.showToast({ title: '登录成功', icon: 'success', duration: 2000 });
            this.checkAndShowPopups();
          })
          .catch(error => {
            wx.showToast({ title: error.message || '登录失败', icon: 'none' });
          });
      },
      fail: (err) => {
        wx.showToast({ title: '获取用户信息失败', icon: 'none' });
      }
    });
  },

  onInfoAddressInput: function(e) {
    this.setData({ infoAddress: e.detail.value });
  },

  onInfoPhoneInput: function(e) {
    this.setData({ infoPhone: e.detail.value });
  },

  chooseLocation: function() {
    wx.chooseLocation({
      success: (res) => {
        const address = res.address || res.name || '';
        if (address) {
          this.setData({ infoAddress: address });
        }
      }
    });
  },

  chooseQrCode: function() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.getFileSystemManager().readFile({
          filePath: tempFilePath,
          encoding: 'base64',
          success: (readRes) => {
            this.setData({ infoQrCode: 'data:image/png;base64,' + readRes.data });
            wx.showToast({ title: '收款码上传成功', icon: 'success' });
          },
          fail: () => {
            wx.showToast({ title: '读取图片失败', icon: 'none' });
          }
        });
      }
    });
  },

  submitInfoCollect: function() {
    const { infoAddress, infoPhone, infoQrCode } = this.data;
    const userInfo = app.globalData.userInfo;
    const isDemander = userInfo.role === 'demander';

    if (!infoAddress) {
      wx.showToast({ title: '请输入地址', icon: 'none' });
      return;
    }
    if (!isDemander && !infoPhone) {
      wx.showToast({ title: '请输入联系电话', icon: 'none' });
      return;
    }
    if (!infoQrCode) {
      wx.showToast({ title: '请上传微信收款码', icon: 'none' });
      return;
    }

    const updateData = {
      address: infoAddress,
      payment_qr_code: infoQrCode
    };
    if (!isDemander) {
      updateData.phone = infoPhone;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    app.saveUserInfo(updateData).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '信息保存成功', icon: 'success', duration: 2000 });
      this.setData({ showInfoCollect: false });

      if (app.isAdmin(app.globalData.userInfo.user_id)) {
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/admin/admin-home' });
        }, 2000);
      } else {
        setTimeout(() => {
          wx.switchTab({ url: '/pages/home/home' });
        }, 2000);
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    });
  }
});