// home.js
const app = getApp();
const { orderApi } = require('../../utils/api');

Page({
  data: {
    demands: [],
    filteredDemands: [],
    activeCategory: 'all',
    searchKeyword: '',
    refreshing: false,
    loadingMore: false,
    page: 1,
    pageSize: 10,
    userRole: ''
  },

  onLoad: function() {
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      this.setData({ userRole: userInfo.role });
    }
    this.loadDemands();
  },

  onShow: function() {
    if (!app.globalData.userInfo) {
      wx.navigateTo({
        url: '/pages/auth/auth'
      });
      return;
    }

    const userRole = app.globalData.userInfo.role;
    this.setData({
      userRole: userRole,
      searchKeyword: '',
      activeCategory: 'all'
    }, () => {
      this.loadDemands();
    });
  },

  loadDemands: function() {
    wx.showLoading({
      title: '加载中...',
      mask: true
    });

    orderApi.getOrders()
      .then(orders => {
        wx.hideLoading();

        if (!Array.isArray(orders)) {
          this.setData({ demands: [], filteredDemands: [] });
          return;
        }

        const userId = app.globalData.userInfo.user_id;
        const userRole = app.globalData.userInfo.role;

        let demands;
        if (userRole === 'demander') {
          demands = orders.filter(order =>
            order.status === 'pending' ||
            order.status === 'accepted' ||
            order.status === 'in_service' ||
            order.status === 'completed' ||
            order.status === 'paid' ||
            order.status === 'rated'
          );
        } else {
          demands = orders.filter(order =>
            (order.status === 'pending' && !order.acceptedById) ||
            (order.acceptedById === userId && order.status !== 'rated')
          );
        }

        this.getUserLocationAndSortDemands(demands);
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({
          title: '加载需求失败',
          icon: 'none'
        });
        this.setData({ demands: [], filteredDemands: [] });
      });
  },

  getUserLocationAndSortDemands: function(demands) {
    wx.getLocation({
      type: 'wgs84',
      success: res => {
        const userLat = res.latitude;
        const userLng = res.longitude;

        const demandsWithDistance = demands.map(demand => {
          let demandLat, demandLng;
          if (demand.location && demand.location.coordinates) {
            demandLat = demand.location.coordinates.lat;
            demandLng = demand.location.coordinates.lng;
          } else if (demand.latitude !== undefined && demand.longitude !== undefined) {
            demandLat = demand.latitude;
            demandLng = demand.longitude;
          } else {
            return { ...demand, distance: null };
          }
          const distance = app.calculateDistance(userLat, userLng, demandLat, demandLng);
          return { ...demand, distance: distance };
        });

        demandsWithDistance.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

        this.setData({
          demands: demandsWithDistance,
          page: 1
        }, () => {
          this.filterDemands();
        });
      },
      fail: () => {
        const demandsWithDistance = demands.map(demand => ({
          ...demand,
          distance: null
        }));

        this.setData({
          demands: demandsWithDistance,
          page: 1
        }, () => {
          this.filterDemands();
        });
      }
    });
  },

  navigateToProviderList: function() {
    wx.navigateTo({
      url: '/pages/provider-list/provider-list'
    });
  },

  refreshDemands: function() {
    this.setData({ refreshing: true });
    this.loadDemands();
    this.setData({ refreshing: false });
  },

  loadMoreDemands: function() {
    if (this.data.loadingMore) return;

    this.setData({ loadingMore: true });

    setTimeout(() => {
      this.setData({ loadingMore: false });
      wx.showToast({
        title: '没有更多数据了',
        icon: 'none'
      });
    }, 1000);
  },

  onSearchInput: function(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    this.filterDemands();
  },

  switchCategory: function(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ activeCategory: category });
    this.filterDemands();
  },

  filterDemands: function() {
    const { demands, activeCategory, searchKeyword } = this.data;

    let filtered = demands;

    if (activeCategory !== 'all') {
      filtered = filtered.filter(demand => demand.applianceType === activeCategory);
    }

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(demand =>
        (demand.title && demand.title.toLowerCase().includes(keyword)) ||
        (demand.description && demand.description.toLowerCase().includes(keyword))
      );
    }

    this.setData({ filteredDemands: filtered });
  },

  showDemandDetail: function(e) {
    const demandId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${demandId}`
    });
  },

  showFilter: function() {
    wx.showToast({
      title: '筛选功能开发中...',
      icon: 'none'
    });
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

  getApplianceTypeText: function(type) {
    const map = {
      'air-conditioner': '空调',
      'refrigerator': '冰箱',
      'washing-machine': '洗衣机',
      'tv': '电视',
      'water-heater': '热水器',
      'range-hood': '油烟机',
      'other': '其他'
    };
    return map[type] || type || '';
  },

  formatDate: function(dateString) {
    return app.formatDate(dateString);
  }
});