Component({
  properties: {
    current: {
      type: String,
      value: ''
    }
  },

  methods: {
    goTags() {
      if (this.data.current === 'tags') return;
      wx.redirectTo({ url: '/pages/tags/tags' });
    },

    goCreate() {
      wx.navigateTo({ url: '/pages/prompt-editor/prompt-editor' });
    },

    goMine() {
      if (this.data.current === 'mine') return;
      wx.redirectTo({ url: '/pages/mine/mine' });
    }
  }
});
