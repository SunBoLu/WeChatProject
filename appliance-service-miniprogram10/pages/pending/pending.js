// pending.js
const app = getApp();

Page({
  data: {
    demands: [],
    isLoading: true
  },

  onLoad: function() {
    // 检查用户是否已登录
    if (!app.globalData.userInfo) {
      wx.navigateTo({
        url: '/pages/auth/auth'
      });
      return;
    }
    
    // 加载待接单需求
    this.loadPendingDemands();
  },

  // 加载待接单需求
  loadPendingDemands: function() {
    this.setData({ isLoading: true });
    
    // 从全局数据中获取需求列表
    const allDemands = app.globalData.mockDemands;
    const userId = app.globalData.userInfo.userId;
    
    // 筛选出当前用户发布的、状态为待接单的需求
    const pendingDemands = allDemands.filter(demand => 
      demand.publisherId === userId && demand.status === 'pending'
    );
    
    this.setData({
      demands: pendingDemands,
      isLoading: false
    });
  },

  // 跳转到需求详情
  navigateToDetail: function(e) {
    const demandId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${demandId}`
    });
  },

  // 获取标签样式类
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

  // 获取标签文本
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

  // 格式化日期
  formatDate: function(dateString) {
    return app.formatDate(dateString);
  }
});