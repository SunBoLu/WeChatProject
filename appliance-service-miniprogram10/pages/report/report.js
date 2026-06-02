// report.js
const app = getApp();

Page({
  data: {
    orders: [],
    orderIndex: 0,
    selectedOrder: null,
    reason: ''
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
    
    // 获取用户可见的订单列表（服务方可以看到所有订单）
    this.loadOrders();
  },

  // 加载订单列表
  loadOrders: function() {
    const userId = app.globalData.userInfo.userId;
    const orders = app.globalData.orders || [];
    
    // 过滤出服务方已接单的订单
    const filteredOrders = orders.filter(order => 
      order.acceptedById === userId && 
      (order.status === 'accepted' || order.status === 'in_service')
    );
    
    this.setData({
      orders: filteredOrders,
      selectedOrder: filteredOrders.length > 0 ? filteredOrders[0] : null
    }, () => {
      wx.hideLoading();
    });
  },

  // 绑定订单选择变化
  bindOrderChange: function(e) {
    const index = e.detail.value;
    this.setData({
      orderIndex: index,
      selectedOrder: this.data.orders[index]
    });
  },

  // 绑定举报理由输入
  bindReasonInput: function(e) {
    this.setData({
      reason: e.detail.value
    });
  },

  // 提交举报
  submitReport: function() {
    const { selectedOrder, reason } = this.data;
    const userId = app.globalData.userInfo.userId;
    
    // 验证输入
    if (!selectedOrder) {
      wx.showToast({
        title: '请选择要举报的订单',
        icon: 'none'
      });
      return;
    }
    
    if (reason.length < 10) {
      wx.showToast({
        title: '请详细描述举报理由',
        icon: 'none'
      });
      return;
    }
    
    // 显示加载动画
    wx.showLoading({
      title: '提交中...',
      mask: true
    });
    
    // 创建举报记录
    const report = {
      id: 'report_' + Date.now(),
      reporterId: userId,
      orderId: selectedOrder.id,
      demanderId: selectedOrder.publisherId,
      reason: reason,
      status: 'pending', // pending, processed, rejected
      createdAt: new Date().toISOString()
    };
    
    // 保存举报记录到全局数据
    if (!app.globalData.reports) {
      app.globalData.reports = [];
    }
    app.globalData.reports.push(report);
    wx.setStorageSync('reports', app.globalData.reports);
    
    // 显示成功提示
    wx.hideLoading();
    wx.showToast({
      title: '举报提交成功',
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