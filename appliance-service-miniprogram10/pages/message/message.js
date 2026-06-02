// message.js
const app = getApp();

Page({
  data: {
    messages: [],
    unreadCount: 0
  },

  onLoad: function() {
    // 检查用户是否已登录
    if (!app.globalData.userInfo) {
      wx.navigateTo({
        url: '/pages/auth/auth'
      });
      return;
    }
    
    // 加载消息列表
    this.loadMessages();
  },

  onShow: function() {
    // 每次显示页面时重新加载消息列表
    this.loadMessages();
  },

  // 加载消息列表
  loadMessages: function() {
    const userId = app.globalData.userInfo.userId;
    const messages = app.getUserMessages(userId);
    const unreadCount = app.getUnreadMessageCount(userId);
    
    this.setData({
      messages: messages,
      unreadCount: unreadCount
    });
  },

  // 标记消息为已读
  markAsRead: function(e) {
    const messageId = e.currentTarget.dataset.id;
    app.markMessageAsRead(messageId);
    
    // 重新加载消息列表
    this.loadMessages();
  },

  // 格式化日期
  formatDate: function(dateString) {
    return app.formatDate(dateString);
  }
});