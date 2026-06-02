// ongoing.js
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
    
    // 加载进行中需求
    this.loadOngoingDemands();
  },

  // 加载进行中需求
  loadOngoingDemands: function() {
    this.setData({ isLoading: true });
    
    // 从全局数据中获取需求列表
    const allDemands = app.globalData.mockDemands;
    const userId = app.globalData.userInfo.userId;
    const userRole = app.globalData.userInfo.role;
    
    let ongoingDemands = [];
    if (userRole === 'demander') {
      // 需求方：筛选出当前用户发布的、状态为已接单或服务中的需求
      ongoingDemands = allDemands.filter(demand => 
        demand.publisherId === userId && (demand.status === 'accepted' || demand.status === 'in_service')
      );
    } else {
      // 服务方：筛选出当前用户接单的、状态为服务中的需求
      ongoingDemands = allDemands.filter(demand => 
        demand.acceptedById === userId && demand.status === 'in_service'
      );
    }
    
    this.setData({
      demands: ongoingDemands,
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
      case 'accepted':
        return '已接单';
      case 'in_service':
        return '服务中';
      default:
        return '进行中';
    }
  },

  // 获取状态样式类
  getStatusClass: function(status) {
    switch (status) {
      case 'accepted':
        return 'status-accepted';
      case 'in_service':
        return 'status-in-service';
      default:
        return 'status-accepted';
    }
  }
});