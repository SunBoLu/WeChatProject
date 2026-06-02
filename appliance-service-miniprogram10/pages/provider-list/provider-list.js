const app = getApp();

Page({
  data: {
    providers: [],
    filteredProviders: [],
    searchKeyword: '',
    isLoading: true,
    showModal: false,
    selectedProvider: null,
    userLocation: null
  },

  onLoad: function() {
    const userInfo = app.globalData.userInfo;

    if (!userInfo) {
      wx.navigateTo({
        url: '/pages/auth/auth'
      });
      return;
    }

    if (userInfo.role !== 'demander') {
      wx.showToast({
        title: '仅需求方可访问此页面',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/home/home'
        });
      }, 2000);
      return;
    }

    this.loadProviders();
  },

  onShow: function() {
    const userInfo = app.globalData.userInfo;

    if (!userInfo) {
      wx.navigateTo({
        url: '/pages/auth/auth'
      });
      return;
    }

    if (userInfo.role !== 'demander') {
      wx.showToast({
        title: '仅需求方可访问此页面',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/home/home'
        });
      }, 2000);
      return;
    }
  },

  loadProviders: function() {
    this.setData({ isLoading: true });

    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const latitude = res.latitude;
        const longitude = res.longitude;

        this.setData({
          userLocation: { latitude, longitude }
        });

        app.getServiceProviders(latitude, longitude, 50)
          .then((providers) => {
            const providersWithDistance = providers.map((provider) => {
              let distance = provider.distance;
              if (!distance && provider.latitude && provider.longitude) {
                distance = app.calculateDistance(
                  latitude, longitude,
                  provider.latitude, provider.longitude
                );
              }
              return {
                ...provider,
                distance: distance
              };
            });

            providersWithDistance.sort((a, b) => (a.distance || 0) - (b.distance || 0));

            this.setData({
              providers: providersWithDistance,
              isLoading: false
            }, () => {
              this.filterProviders();
            });
          })
          .catch(() => {
            wx.showToast({
              title: '加载服务方失败',
              icon: 'none'
            });
            this.setData({ isLoading: false });
          });
      },
      fail: () => {
        wx.showToast({
          title: '获取位置失败，请开启定位权限',
          icon: 'none'
        });
        this.setData({ isLoading: false });
      }
    });
  },

  onPullDownRefresh: function() {
    this.loadProviders();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1500);
  },

  onSearchInput: function(e) {
    const keyword = e.detail.value;
    this.setData({
      searchKeyword: keyword
    });
    this.filterProviders();
  },

  filterProviders: function() {
    const { providers, searchKeyword } = this.data;
    let filtered = providers;

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter((provider) =>
        (provider.name && provider.name.toLowerCase().includes(keyword)) ||
        (provider.address && provider.address.toLowerCase().includes(keyword))
      );
    }

    this.setData({
      filteredProviders: filtered
    });
  },

  showProviderDetail: function(e) {
    const providerId = e.currentTarget.dataset.id;
    const provider = this.data.providers.find((p) => p.user_id === providerId);

    if (provider) {
      this.setData({
        showModal: true,
        selectedProvider: provider
      });
    }
  },

  closeModal: function() {
    this.setData({
      showModal: false,
      selectedProvider: null
    });
  },

  formatDistance: function(distance) {
    if (distance == null || distance === undefined) return '';
    const km = parseFloat(distance);
    if (isNaN(km)) return '';
    if (km < 1) {
      return (km * 1000).toFixed(0) + 'm';
    }
    return km.toFixed(1) + 'km';
  },

  formatDate: function(dateString) {
    return app.formatDate(dateString);
  }
});