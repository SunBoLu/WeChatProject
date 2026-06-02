// demands.js
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
    
    // 加载我的发布
    this.loadMyDemands();
  },

  // 加载我的发布
  loadMyDemands: function() {
    this.setData({ isLoading: true });
    
    // 从全局数据中获取需求列表
    const allDemands = app.globalData.mockDemands;
    const userId = app.globalData.userInfo.userId;
    
    // 筛选出当前用户发布的需求
    const myDemands = allDemands.filter(demand => demand.publisherId === userId);
    
    this.setData({
      demands: myDemands,
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
  },

  // 获取状态文本
  getStatusText: function(status) {
    switch (status) {
      case 'pending':
        return '待接单';
      case 'accepted':
        return '已接单';
      case 'in_service':
        return '服务中';
      case 'completed':
        return '已完成';
      case 'paid':
        return '已支付';
      case 'rated':
        return '已评价';
      default:
        return '未知状态';
    }
  },

  // 获取状态样式类
  getStatusClass: function(status) {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'accepted':
        return 'status-accepted';
      case 'in_service':
        return 'status-in-service';
      case 'completed':
        return 'status-completed';
      case 'paid':
        return 'status-paid';
      case 'rated':
        return 'status-rated';
      default:
        return 'status-pending';
    }
  }
});