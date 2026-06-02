// admin-home.js
const app = getApp();

Page({
  data: {
    orders: [],
    filteredOrders: [],
    searchKeyword: '',
    activeFilter: 'all'
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
    
    // 加载订单列表
    const orders = app.globalData.orders || [];
    
    this.setData({
      orders: orders,
      filteredOrders: orders
    }, () => {
      if (showLoadingFlag) {
        wx.hideLoading();
      }
    });
  },

  // 防抖计时器
  _searchTimer: null,

  // 绑定搜索输入（防抖处理）
  bindSearchInput: function(e) {
    const value = e.detail.value;
    
    // 清除之前的定时器
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
    }
    
    // 设置新的定时器，500ms后执行搜索
    this._searchTimer = setTimeout(() => {
      this.setData({
        searchKeyword: value
      }, () => {
        // 输入停止后自动执行搜索
        this.searchOrder();
      });
    }, 500);
  },

  // 搜索订单
  searchOrder: function() {
    const { orders, searchKeyword, activeFilter } = this.data;
    let filtered = orders;
    
    // 应用筛选
    if (activeFilter !== 'all') {
      filtered = filtered.filter(order => order.status === activeFilter);
    }
    
    // 应用搜索
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(order => 
        order.title.toLowerCase().includes(keyword) ||
        order.contactInfo.name.toLowerCase().includes(keyword) ||
        order.contactInfo.phone.includes(keyword) ||
        (order.serviceProvider && order.serviceProvider.name.toLowerCase().includes(keyword)) ||
        (order.serviceProvider && order.serviceProvider.phone.includes(keyword))
      );
    }
    
    this.setData({
      filteredOrders: filtered
    });
  },

  // 设置筛选条件
  setFilter: function(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({
      activeFilter: filter
    }, () => {
      this.searchOrder();
    });
  },

  // 查看订单详情
  viewOrderDetail: function(e) {
    const orderId = e.currentTarget.dataset.orderId;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${orderId}`
    });
  },

  // 删除订单
  deleteOrder: function(e) {
    const orderId = e.currentTarget.dataset.orderId;
    
    // 显示确认弹窗
    wx.showModal({
      title: '删除订单',
      content: '确定要删除这个订单吗？删除后无法恢复。',
      success: (res) => {
        if (res.confirm) {
          // 显示加载动画
          wx.showLoading({
            title: '删除中...',
            mask: true
          });
          
          // 删除订单
          app.deleteOrder(orderId)
            .then(result => {
              wx.hideLoading();
              wx.showToast({
                title: result.message,
                icon: 'success',
                duration: 2000,
                success: () => {
                  // 重新加载订单列表
                  this.loadData();
                }
              });
            })
            .catch(error => {
              wx.hideLoading();
              wx.showToast({
                title: error.message || '删除失败',
                icon: 'none'
              });
            });
        }
      }
    });
  },

  // 获取订单状态文本
  getStatusText: function(status) {
    const statusMap = {
      pending: '等待接单',
      accepted: '已接单',
      in_service: '服务中',
      completed: '服务完成',
      paid: '已支付',
      rated: '已评价'
    };
    return statusMap[status] || status;
  },

  // 格式化日期
  formatDate: function(dateString) {
    return app.formatDate(dateString);
  },

  // 切换到订单管理页面
  switchToHome: function() {
    // 已经在订单管理页面，无需跳转
  },

  // 切换到反馈举报页面
  switchToFeedback: function() {
    wx.redirectTo({
      url: '/pages/admin/feedback-manage'
    });
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