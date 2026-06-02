// feedback-manage.js
const app = getApp();

Page({
  data: {
    activeTab: 'all',
    activeStatus: 'all',
    feedbacks: [],
    reports: [],
    filteredFeedbacks: [],
    filteredReports: []
  },

  onLoad: function() {
    // 检查是否为管理员
    if (!app.isAdmin(app.globalData.userInfo.userId)) {
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
    this.loadData(true);
  },

  // 加载数据
  loadData: function(showLoadingFlag) {
    if (showLoadingFlag) {
      wx.showLoading({
        title: '加载中...',
        mask: true
      });
    }
    
    // 加载反馈列表
    const feedbacks = app.getFeedbacks() || [];
    // 加载举报列表
    const reports = app.getReports() || [];
    // 获取用户列表
    const users = app.globalData.users || [];
    // 获取订单列表
    const orders = app.globalData.orders || [];
    
    // 处理反馈数据，添加用户名称
    const processedFeedbacks = feedbacks.map(feedback => {
      const demander = users.find(u => u.userId === feedback.demanderId);
      const provider = users.find(u => u.userId === feedback.serviceProviderId);
      return {
        ...feedback,
        demanderName: demander ? demander.name : '未知用户',
        providerName: provider ? provider.name : '未知用户'
      };
    });
    
    // 处理举报数据，添加用户名称和订单标题
    const processedReports = reports.map(report => {
      const reporter = users.find(u => u.userId === report.reporterId);
      const demander = users.find(u => u.userId === report.demanderId);
      const order = orders.find(o => o.id === report.orderId);
      return {
        ...report,
        reporterName: reporter ? reporter.name : '未知用户',
        demanderName: demander ? demander.name : '未知用户',
        orderTitle: order ? order.title : '未知订单'
      };
    });
    
    this.setData({
      feedbacks: processedFeedbacks,
      reports: processedReports
    }, () => {
      this.filterData();
      if (showLoadingFlag) {
        wx.hideLoading();
      }
    });
  },

  // 筛选数据
  filterData: function() {
    const { feedbacks, reports, activeTab, activeStatus } = this.data;
    
    let filteredFeedbacks = [...feedbacks];
    let filteredReports = [...reports];
    
    // 按类型筛选
    if (activeTab === 'feedback') {
      filteredReports = [];
    } else if (activeTab === 'report') {
      filteredFeedbacks = [];
    }
    
    // 按状态筛选
    if (activeStatus !== 'all') {
      filteredFeedbacks = filteredFeedbacks.filter(item => item.status === activeStatus);
      filteredReports = filteredReports.filter(item => item.status === activeStatus);
    }
    
    this.setData({
      filteredFeedbacks: filteredFeedbacks,
      filteredReports: filteredReports
    });
  },

  // 切换标签
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab
    }, () => {
      this.filterData();
    });
  },

  // 设置状态筛选
  setStatusFilter: function(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      activeStatus: status
    }, () => {
      this.filterData();
    });
  },

  // 处理反馈
  handleFeedback: function(e) {
    const { id, action } = e.currentTarget.dataset;
    const status = action === 'process' ? 'processed' : 'rejected';
    const message = action === 'process' ? '处理成功' : '已驳回';
    
    wx.showModal({
      title: action === 'process' ? '确认处理' : '确认驳回',
      content: action === 'process' ? '确定要处理这个反馈吗？' : '确定要驳回这个反馈吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '处理中...',
            mask: true
          });
          
          app.updateFeedbackStatus(id, status)
            .then(result => {
              wx.hideLoading();
              wx.showToast({
                title: message,
                icon: 'success',
                duration: 1500,
                success: () => {
                  setTimeout(() => {
                    this.loadData();
                  }, 1500);
                }
              });
            })
            .catch(error => {
              wx.hideLoading();
              wx.showToast({
                title: error.message || '操作失败',
                icon: 'none'
              });
            });
        }
      }
    });
  },

  // 处理举报
  handleReport: function(e) {
    const { id, action } = e.currentTarget.dataset;
    const status = action === 'process' ? 'processed' : 'rejected';
    const message = action === 'process' ? '处理成功' : '已驳回';
    
    wx.showModal({
      title: action === 'process' ? '确认处理' : '确认驳回',
      content: action === 'process' ? '确定要处理这个举报吗？' : '确定要驳回这个举报吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '处理中...',
            mask: true
          });
          
          app.updateReportStatus(id, status)
            .then(result => {
              wx.hideLoading();
              wx.showToast({
                title: message,
                icon: 'success',
                duration: 1500,
                success: () => {
                  setTimeout(() => {
                    this.loadData();
                  }, 1500);
                }
              });
            })
            .catch(error => {
              wx.hideLoading();
              wx.showToast({
                title: error.message || '操作失败',
                icon: 'none'
              });
            });
        }
      }
    });
  },

  // 获取状态文本
  getStatusText: function(status) {
    const statusMap = {
      pending: '待处理',
      processed: '已处理',
      rejected: '已驳回'
    };
    return statusMap[status] || status;
  },

  // 格式化日期
  formatDate: function(dateString) {
    return app.formatDate(dateString);
  },

  // 切换到订单管理页面
  switchToHome: function() {
    wx.redirectTo({
      url: '/pages/admin/admin-home'
    });
  },

  // 切换到反馈举报页面
  switchToFeedback: function() {
    // 已经在反馈举报页面，无需跳转
  },

  // 切换到管理员管理页面
  switchToProfile: function() {
    wx.redirectTo({
      url: '/pages/admin/admin-profile'
    });
  },

  // 切换到用户管理页面
  switchToUserManage: function() {
    wx.navigateTo({
      url: '/pages/admin/user-manage'
    });
  }
});
