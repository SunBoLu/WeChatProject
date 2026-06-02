const app = getApp();

Page({
  data: {
    demand: null,
    publisher: null,
    provider: null,
    providerRating: 4.5,
    canAccept: false,
    canStartService: false,
    canSetFinalAmount: false,
    userInfo: null,
    isAdmin: false
  },

  onLoad: function(options) {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });

    const demandId = options.id || options.demandId;
    if (!demandId) {
      wx.hideLoading();
      wx.showToast({
        title: '需求ID不存在',
        icon: 'none',
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    if (!app.globalData.userInfo) {
      wx.hideLoading();
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        success: () => {
          wx.navigateTo({
            url: '/pages/auth/auth'
          });
        }
      });
      return;
    }

    const userInfo = app.globalData.userInfo;
    const isAdmin = app.isAdmin(userInfo.user_id);

    app.getDemandDetail(demandId)
      .then(order => {
        const demand = this.normalizeDemand(order);
        const canAccept = userInfo.role === 'serviceProvider' && demand.status === 'pending';
        const finalAmount = demand.final_amount || demand.finalAmount || 0;
        const canStartService = userInfo.role === 'serviceProvider' && demand.status === 'accepted' && finalAmount > 0;
        const canSetFinalAmount = userInfo.role === 'serviceProvider' && (demand.status === 'accepted' || demand.status === 'in_service') && finalAmount === 0;

        this.setData({
          demand: demand,
          publisher: order.publisher || null,
          provider: order.provider || null,
          canAccept: canAccept,
          canStartService: canStartService,
          canSetFinalAmount: canSetFinalAmount,
          userInfo: userInfo,
          isAdmin: isAdmin
        });

        if (order.provider) {
          const rating = app.calculateUserRating(order.provider.user_id);
          this.setData({
            providerRating: Math.floor(rating || 3.0)
          });
        }

        wx.hideLoading();
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({
          title: '需求不存在',
          icon: 'none',
          success: () => {
            wx.navigateBack();
          }
        });
      });
  },

  normalizeDemand: function(order) {
    return {
      id: order.id || order._id,
      title: order.title || '',
      description: order.description || '',
      type: order.serviceType || order.service_type || '',
      applianceType: order.applianceType || order.appliance_type || '',
      status: order.status || 'pending',
      finalAmount: order.finalAmount || order.final_amount || 0,
      budget: order.budget || 0,
      createdAt: order.createdAt || order.created_at || new Date().toISOString(),
      publisherId: order.publisherId || order.publisher_id || (order.publisher ? order.publisher.user_id : ''),
      acceptedById: order.acceptedById || order.accepted_by_id || (order.provider ? order.provider.user_id : ''),
      address: order.address || '',
      contactName: order.contactName || order.contact_name || (order.publisher ? order.publisher.name : ''),
      contactPhone: order.contactPhone || order.contact_phone || (order.publisher ? order.publisher.phone : ''),
      location: order.location || { address: order.address || '' }
    };
  },

  formatDate: function(dateString) {
    return app.formatDate(dateString);
  },

  maskPhone: function(phone) {
    if (!phone || phone.length !== 11) return phone;
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  },

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

  contactUser: function() {
    const { demand, publisher, provider, userInfo } = this.data;

    if (userInfo && userInfo.role === 'demander' && demand.status !== 'pending' && provider) {
      const phone = provider.phone;
      if (phone) {
        wx.makePhoneCall({
          phoneNumber: phone,
          fail: () => {
            wx.showToast({ title: '拨打电话失败', icon: 'none' });
          }
        });
      } else {
        wx.showToast({ title: '服务方未提供联系电话', icon: 'none' });
      }
    } else {
      const phone = demand.contactPhone || (publisher ? publisher.phone : '');
      if (phone) {
        wx.makePhoneCall({
          phoneNumber: phone,
          fail: () => {
            wx.showToast({ title: '拨打电话失败', icon: 'none' });
          }
        });
      } else {
        wx.showToast({ title: '未提供联系电话', icon: 'none' });
      }
    }
  },

  openChat: function() {
    const { demand, publisher, provider, userInfo } = this.data;

    if (userInfo && userInfo.role === 'demander' && demand.status !== 'pending' && provider) {
      wx.navigateTo({
        url: `/pages/chat/chat?userId=${provider.user_id}&userName=${provider.name}&orderId=${demand.id}`
      });
    } else {
      const targetUser = publisher || {};
      const userId = targetUser.user_id || demand.publisherId;
      const userName = targetUser.name || demand.contactName || '';
      wx.navigateTo({
        url: `/pages/chat/chat?userId=${userId}&userName=${userName}&orderId=${demand.id}`
      });
    }
  },

  showAcceptModal: function() {
    const userInfo = app.globalData.userInfo;
    if (userInfo && userInfo.role === 'serviceProvider' && !userInfo.phone) {
      wx.showModal({
        title: '请提供联系电话',
        content: '',
        editable: true,
        placeholderText: '作为服务方，您需要提供联系电话以便客户联系您。',
        success: (res) => {
          if (res.confirm) {
            const phone = res.content.trim();
            if (!phone) {
              wx.showToast({ title: '请输入联系电话', icon: 'none' });
              return;
            }
            if (!/^1[3-9]\d{9}$/.test(phone)) {
              wx.showToast({ title: '手机号格式不正确', icon: 'none' });
              return;
            }
            userInfo.phone = phone;
            app.globalData.userInfo = userInfo;
            wx.setStorageSync('userInfo', userInfo);
            app.updateUserInfo({ phone: phone }).then(() => {
              this.showAcceptConfirmModal();
            }).catch(() => {
              this.showAcceptConfirmModal();
            });
          }
        }
      });
    } else {
      this.showAcceptConfirmModal();
    }
  },

  showAcceptConfirmModal: function() {
    wx.showModal({
      title: '确认接单',
      content: '您确定要接下这个需求吗？接单后请及时与客户联系确认服务细节。',
      success: (res) => {
        if (res.confirm) {
          this.acceptDemand();
        }
      }
    });
  },

  acceptDemand: function() {
    app.acceptDemand(this.data.demand.id)
      .then(() => {
        wx.showToast({
          title: '接单成功',
          icon: 'success',
          duration: 2000,
          success: () => {
            this.onLoad({ id: this.data.demand.id });
          }
        });
      })
      .catch(error => {
        wx.showToast({
          title: error.message || '接单失败',
          icon: 'none'
        });
      });
  },

  startService: function() {
    app.startService(this.data.demand.id)
      .then(() => {
        wx.showToast({
          title: '服务开始',
          icon: 'success',
          duration: 2000,
          success: () => {
            this.onLoad({ id: this.data.demand.id });
          }
        });
      })
      .catch(error => {
        wx.showToast({
          title: error.message || '操作失败',
          icon: 'none'
        });
      });
  },

  completeService: function() {
    app.completeService(this.data.demand.id)
      .then(() => {
        wx.showToast({
          title: '服务完成',
          icon: 'success',
          duration: 2000,
          success: () => {
            this.onLoad({ id: this.data.demand.id });
          }
        });
      })
      .catch(error => {
        wx.showToast({
          title: error.message || '操作失败',
          icon: 'none'
        });
      });
  },

  payService: function() {
    const amount = this.data.demand.finalAmount || this.data.demand.budget || '200';
    app.payService(this.data.demand.id, amount)
      .then(() => {
        wx.showToast({
          title: '支付成功',
          icon: 'success',
          duration: 2000,
          success: () => {
            this.onLoad({ id: this.data.demand.id });
          }
        });
      })
      .catch(error => {
        wx.showToast({
          title: error.message || '支付失败',
          icon: 'none'
        });
      });
  },

  navigateToRating: function() {
    wx.navigateTo({
      url: `/pages/rating/rating?id=${this.data.demand.id}`
    });
  },

  showDeleteModal: function() {
    wx.showModal({
      title: '删除需求',
      content: '确定要删除这个需求吗？删除后无法恢复。',
      success: (res) => {
        if (res.confirm) {
          this.deleteDemand();
        }
      }
    });
  },

  deleteDemand: function() {
    const demandId = this.data.demand.id;
    app.deleteOrder(demandId)
      .then(() => {
        wx.showToast({
          title: '删除成功',
          icon: 'success',
          duration: 2000,
          success: () => {
            wx.switchTab({
              url: '/pages/home/home'
            });
          }
        });
      })
      .catch(error => {
        wx.showToast({
          title: error.message || '删除失败',
          icon: 'none'
        });
      });
  },

  showSetFinalAmountModal: function() {
    wx.showModal({
      title: '设置最终服务金额',
      content: '',
      editable: true,
      placeholderText: '请输入与需求方沟通后确定的最终服务金额',
      success: (res) => {
        if (res.confirm) {
          const finalAmount = parseFloat(res.content.trim());
          if (isNaN(finalAmount) || finalAmount <= 0) {
            wx.showToast({
              title: '请输入有效的金额',
              icon: 'none'
            });
            return;
          }

          wx.showModal({
            title: '确认金额',
            content: '请确认当前服务的最终金额无误，订单发起方已预支付50元，输入的最终金额应包含用户预支付的50元，即最终金额 = 预支付（50元）+ 您与用户沟通之后确认应增加的金额。预付的50元会在您完成订单之后，在三个工作日内通过您的微信收款码发给您。平台会进行一定的抽佣，一般为10%至20%，请您谅解。',
            success: (res) => {
              if (res.confirm) {
                this.setFinalAmount(finalAmount);
              }
            }
          });
        }
      }
    });
  },

  setFinalAmount: function(finalAmount) {
    app.setFinalAmount(this.data.demand.id, finalAmount)
      .then(() => {
        wx.showToast({
          title: '最终金额设置成功',
          icon: 'success',
          duration: 2000,
          success: () => {
            this.onLoad({ id: this.data.demand.id });
          }
        });
      })
      .catch(error => {
        wx.showToast({
          title: error.message || '设置失败',
          icon: 'none'
        });
      });
  }
});