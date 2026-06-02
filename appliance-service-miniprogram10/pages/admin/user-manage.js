const app = getApp();

Page({
  data: {
    users: [],
    filteredUsers: [],
    activeRole: 'all',
    searchKeyword: '',
    showWarningModal: false,
    warningUserId: '',
    warningReason: '',
    showHistoryModal: false,
    historyUser: null
  },

  onLoad: function() {
    if (!app.isAdmin(app.globalData.userInfo.user_id)) {
      wx.showToast({
        title: '无权限访问',
        icon: 'none',
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }
    this.loadUsers();
  },

  loadUsers: function() {
    wx.showLoading({ title: '加载中...', mask: true });

    const params = {};
    if (this.data.activeRole !== 'all') {
      params.role = this.data.activeRole;
    }
    if (this.data.searchKeyword) {
      params.keyword = this.data.searchKeyword;
    }

    app.getUsers(params)
      .then(users => {
        const userList = (users || []).map(user => ({
          user_id: user.user_id || user.userId,
          name: user.name || '未知用户',
          phone: user.phone || '',
          role: user.role || 'demander',
          is_banned: user.is_banned || user.isBanned || false,
          warning_count: user.warning_count || user.warningCount || 0,
          avatar: user.avatar || '',
          warning_history: user.warning_history || user.warningHistory || []
        }));

        this.setData({
          users: userList,
          filteredUsers: userList
        });
        wx.hideLoading();
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onSearchInput: function(e) {
    const value = e.detail.value;
    this.setData({ searchKeyword: value });
  },

  onSearch: function() {
    this.loadUsers();
  },

  setRoleFilter: function(e) {
    const role = e.currentTarget.dataset.role;
    this.setData({ activeRole: role }, () => {
      this.loadUsers();
    });
  },

  getRoleText: function(role) {
    const map = { demander: '需求方', serviceProvider: '服务方', admin: '管理员' };
    return map[role] || role;
  },

  showWarnModal: function(e) {
    const userId = e.currentTarget.dataset.userId;
    this.setData({
      showWarningModal: true,
      warningUserId: userId,
      warningReason: ''
    });
  },

  hideWarnModal: function() {
    this.setData({
      showWarningModal: false,
      warningUserId: '',
      warningReason: ''
    });
  },

  onWarningReasonInput: function(e) {
    this.setData({ warningReason: e.detail.value });
  },

  confirmWarn: function() {
    const { warningUserId, warningReason } = this.data;
    if (!warningReason.trim()) {
      wx.showToast({ title: '请输入警告原因', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });
    app.addWarning(warningUserId, warningReason.trim())
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '警告成功', icon: 'success' });
        this.hideWarnModal();
        this.loadUsers();
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '警告失败', icon: 'none' });
      });
  },

  unbanUser: function(e) {
    const userId = e.currentTarget.dataset.userId;

    wx.showModal({
      title: '解除禁用',
      content: '确定要解除该用户的账号禁用吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true });
          app.unbanUser(userId)
            .then(() => {
              wx.hideLoading();
              wx.showToast({ title: '解除禁用成功', icon: 'success' });
              this.loadUsers();
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: '操作失败', icon: 'none' });
            });
        }
      }
    });
  },

  showHistoryModal: function(e) {
    const userId = e.currentTarget.dataset.userId;
    const user = this.data.users.find(u => u.user_id === userId);
    this.setData({
      showHistoryModal: true,
      historyUser: user || null
    });
  },

  hideHistoryModal: function() {
    this.setData({
      showHistoryModal: false,
      historyUser: null
    });
  },

  formatDate: function(dateString) {
    return app.formatDate(dateString);
  }
});