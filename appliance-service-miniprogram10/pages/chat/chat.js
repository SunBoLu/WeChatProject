// chat.js
const app = getApp();

Page({
  data: {
    userId: '',
    userName: '',
    orderId: '',
    messages: [],
    inputValue: '',
    scrollToMessage: '',
    myAvatar: 'https://p26-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/a33c806e018049f9accc4f8f874e5cc3~tplv-a9rns2rl98-image.image?lk3s=8e244e95&rcl=2026040114542862841A149A1450CE3E0A&rrcfp=f06b921b&x-expires=1777618535&x-signature=1wU7uc6n7x%2BzoVT2vyNhLIvFOao%3D',
    otherAvatar: 'https://p26-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/a33c806e018049f9accc4f8f874e5cc3~tplv-a9rns2rl98-image.image?lk3s=8e244e95&rcl=2026040114542862841A149A1450CE3E0A&rrcfp=f06b921b&x-expires=1777618535&x-signature=1wU7uc6n7x%2BzoVT2vyNhLIvFOao%3D'
  },

  onLoad: function(options) {
    const { userId, userName, orderId } = options;
    this.setData({
      userId: userId || '',
      userName: userName || '用户',
      orderId: orderId || ''
    });

    wx.setNavigationBarTitle({
      title: this.data.userName
    });

    this.loadMessages();
  },

  shouldShowTime: function(currentMinTotal, previousMinTotal) {
    if (previousMinTotal === null || previousMinTotal === undefined) return true;
    if (currentMinTotal < previousMinTotal) return true;
    return currentMinTotal - previousMinTotal > 3;
  },

  processMessagesWithTime: function(messages) {
    let previousTotalMinutes = null;
    return messages.map((message) => {
      const currentTotalMinutes = message._totalMinutes;
      const showTime = this.shouldShowTime(currentTotalMinutes, previousTotalMinutes);
      previousTotalMinutes = currentTotalMinutes;
      return {
        ...message,
        showTime: showTime
      };
    });
  },

  loadMessages: function() {
    const currentUserId = app.globalData.userInfo.user_id;
    const { orderId } = this.data;

    if (!orderId) return;

    const messages = app.getChatMessages(orderId, currentUserId);

    const formattedMessages = messages.map(message => ({
      id: message.id,
      content: message.content || '',
      imageUrl: message.image_url || '',
      time: this.formatTime(message.created_at),
      _totalMinutes: this.getTotalMinutes(message.created_at),
      isMine: message.sender_id === currentUserId,
      type: message.type || 'chat'
    }));

    const processedMessages = this.processMessagesWithTime(formattedMessages);

    this.setData({
      messages: processedMessages,
      scrollToMessage: processedMessages.length > 0 ? 'msg-bottom' : ''
    });

    app.markMessagesAsRead(orderId, currentUserId);
  },

  getTotalMinutes: function(dateString) {
    const date = new Date(dateString);
    return date.getHours() * 60 + date.getMinutes();
  },

  formatTime: function(dateString) {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  onInput: function(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  sendMessage: function() {
    const { inputValue, messages, userId, orderId } = this.data;
    if (!inputValue.trim()) return;

    const currentUserId = app.globalData.userInfo.user_id;

    app.sendMessage(currentUserId, userId, inputValue, orderId)
      .then(newMessage => {
        this.appendMessage({
          id: newMessage.id,
          content: newMessage.content,
          imageUrl: '',
          time: newMessage.created_at ? this.formatTime(newMessage.created_at) : this.formatTime(new Date().toISOString()),
          _totalMinutes: newMessage.created_at ? this.getTotalMinutes(newMessage.created_at) : new Date().getHours() * 60 + new Date().getMinutes(),
          isMine: true,
          type: 'chat'
        });
      })
      .catch(() => {
        wx.showToast({
          title: '发送失败',
          icon: 'none'
        });
      });
  },

  sendImageMessage: function() {
    const { userId, orderId } = this;

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];

        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: tempFilePath,
          encoding: 'base64',
          success: (fileRes) => {
            const currentUserId = app.globalData.userInfo.user_id;
            const base64Data = `data:image/jpeg;base64,${fileRes.data}`;

            app.sendMessage(currentUserId, userId, '', orderId, base64Data)
              .then(newMessage => {
                this.appendMessage({
                  id: newMessage.id,
                  content: '',
                  imageUrl: newMessage.image_url || base64Data,
                  time: newMessage.created_at ? this.formatTime(newMessage.created_at) : this.formatTime(new Date().toISOString()),
                  _totalMinutes: newMessage.created_at ? this.getTotalMinutes(newMessage.created_at) : new Date().getHours() * 60 + new Date().getMinutes(),
                  isMine: true,
                  type: 'image'
                });
              })
              .catch(() => {
                wx.showToast({
                  title: '图片发送失败',
                  icon: 'none'
                });
              });
          },
          fail: () => {
            wx.showToast({
              title: '图片读取失败',
              icon: 'none'
            });
          }
        });
      }
    });
  },

  appendMessage: function(formattedMessage) {
    const messages = [...this.data.messages];
    const previousTotalMinutes = messages.length > 0 ? messages[messages.length - 1]._totalMinutes : null;
    const showTime = this.shouldShowTime(formattedMessage._totalMinutes, previousTotalMinutes);

    messages.push({
      ...formattedMessage,
      showTime: showTime
    });

    this.setData({
      messages: messages,
      inputValue: '',
      scrollToMessage: 'msg-bottom'
    });
  },

  previewImage: function(e) {
    const { url } = e.currentTarget.dataset;
    wx.previewImage({
      urls: [url],
      current: url
    });
  },

  showEmoji: function() {
    wx.showToast({
      title: '表情功能开发中...',
      icon: 'none'
    });
  },

  onScroll: function() {
  }
});