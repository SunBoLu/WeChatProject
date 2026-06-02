// feedback.js
const app = getApp();

Page({
  data: {
    providers: [],
    providerIndex: 0,
    selectedProvider: null,
    problem: ''
  },

  onLoad: function() {
    // 显示加载动画
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    
    // 检查用户是否已登录
    if (!app.globalData.userInfo) {
      wx.hideLoading();
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }
    
    // 获取为当前需求方服务过的服务方列表
    this.loadProviders();
  },

  // 加载服务方列表
  loadProviders: function() {
    const userId = app.globalData.userInfo.userId;
    const orders = app.globalData.orders || [];
    
    // 获取当前用户作为需求方的订单
    const myOrders = orders.filter(order => 
      order.publisherId === userId && 
      (order.status === 'completed' || order.status === 'paid' || order.status === 'rated')
    );
    
    // 提取服务方ID列表
    const providerIds = [...new Set(myOrders.map(order => order.acceptedById).filter(id => id))];
    
    // 从用户数据库中获取服务方信息
    const users = app.globalData.users || [];
    const providers = users.filter(user => 
      user.role === 'serviceProvider' && providerIds.includes(user.userId)
    );
    
    this.setData({
      providers: providers,
      selectedProvider: providers.length > 0 ? providers[0] : null
    }, () => {
      wx.hideLoading();
    });
  },

  // 绑定服务方选择变化
  bindProviderChange: function(e) {
    const index = e.detail.value;
    this.setData({
      providerIndex: index,
      selectedProvider: this.data.providers[index]
    });
  },

  // 绑定反馈问题输入
  bindProblemInput: function(e) {
    this.setData({
      problem: e.detail.value
    });
  },

  // 提交反馈
  submitFeedback: function() {
    const { selectedProvider, problem } = this.data;
    const userId = app.globalData.userInfo.userId;
    
    // 验证输入
    if (!selectedProvider) {
      wx.showToast({
        title: '请选择服务方',
        icon: 'none'
      });
      return;
    }
    
    if (problem.length < 10) {
      wx.showToast({
        title: '请详细描述反馈问题',
        icon: 'none'
      });
      return;
    }
    
    // 显示加载动画
    wx.showLoading({
      title: '提交中...',
      mask: true
    });
    
    // 创建反馈记录
    const feedback = {
      id: 'feedback_' + Date.now(),
      demanderId: userId,
      serviceProviderId: selectedProvider.userId,
      problem: problem,
      status: 'pending', // pending, processed, rejected
      createdAt: new Date().toISOString()
    };
    
    // 保存反馈记录到全局数据
    if (!app.globalData.feedbacks) {
      app.globalData.feedbacks = [];
    }
    app.globalData.feedbacks.push(feedback);
    wx.setStorageSync('feedbacks', app.globalData.feedbacks);
    
    // 显示成功提示
    wx.hideLoading();
    wx.showToast({
      title: '反馈提交成功',
      icon: 'success',
      duration: 2000,
      success: () => {
        // 跳回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 2000);
      }
    });
  }
});