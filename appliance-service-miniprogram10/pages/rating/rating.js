// rating.js
const app = getApp();

Page({
  data: {
    demand: null,
    rating: 5,
    comment: '',
    stars: [1, 2, 3, 4, 5]
  },

  onLoad: function(options) {
    const demandId = options.id;
    if (!demandId) {
      wx.showToast({
        title: '需求ID不存在',
        icon: 'none',
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    // 获取需求详情
    const demand = app.getDemandDetail(demandId);
    if (!demand) {
      wx.showToast({
        title: '需求不存在',
        icon: 'none',
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    this.setData({
      demand: demand
    });
  },

  // 选择评分
  selectRating: function(e) {
    const rating = parseInt(e.currentTarget.dataset.rating);
    this.setData({
      rating: rating
    });
  },

  // 输入评价内容
  onCommentInput: function(e) {
    this.setData({
      comment: e.detail.value
    });
  },

  // 提交评价
  submitRating: function() {
    const { demand, rating, comment } = this.data;

    // 验证评价内容
    if (!comment.trim()) {
      wx.showToast({
        title: '请输入评价内容',
        icon: 'none'
      });
      return;
    }

    // 调用评价服务方法
    app.rateService(demand.id, rating, comment)
      .then(() => {
        wx.showToast({
          title: '评价成功',
          icon: 'success',
          duration: 2000,
          success: () => {
            // 跳转到首页
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/home/home'
              });
            }, 2000);
          }
        });
      })
      .catch(error => {
        wx.showToast({
          title: error.message || '评价失败',
          icon: 'none'
        });
      });
  }
});