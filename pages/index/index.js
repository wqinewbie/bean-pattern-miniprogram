const { API_BASE_URL } = require("../../utils/config");
const { request } = require("../../utils/request");

Page({
  data: {
    token: "",
    loading: false,
    originalUrl: "",
    processedUrl: ""
  },

  onLoad() {
    this.wxLogin();
  },

  wxLogin() {
    wx.login({
      success: async (loginRes) => {
        if (!loginRes.code) {
          wx.showToast({ title: "登录失败", icon: "none" });
          return;
        }
        try {
          const res = await request("/auth/wx-login", "POST", { code: loginRes.code });
          if (!res.success) {
            throw new Error(res.message || "登录失败");
          }
          this.setData({ token: res.data.token });
        } catch (error) {
          wx.showToast({ title: "登录失败", icon: "none" });
        }
      },
      fail: () => wx.showToast({ title: "登录失败", icon: "none" })
    });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: async (chooseRes) => {
        const filePath = chooseRes.tempFiles[0].tempFilePath;
        await this.uploadAndProcess(filePath);
      }
    });
  },

  uploadAndProcess(filePath) {
    this.setData({ loading: true, originalUrl: "", processedUrl: "" });
    return new Promise((resolve) => {
      wx.uploadFile({
        url: `${API_BASE_URL}/image/upload`,
        filePath,
        name: "file",
        success: async (uploadRes) => {
          try {
            const uploadData = JSON.parse(uploadRes.data);
            if (!uploadData.success) {
              throw new Error(uploadData.message || "上传失败");
            }
            const originalUrl = uploadData.data.originalUrl;
            this.setData({ originalUrl });

            const processData = await request("/image/process", "POST", { imageUrl: originalUrl });
            if (!processData.success) {
              throw new Error(processData.message || "处理失败");
            }
            this.setData({ processedUrl: processData.data.processedUrl });
          } catch (error) {
            wx.showToast({ title: error.message || "处理失败", icon: "none" });
          } finally {
            this.setData({ loading: false });
            resolve();
          }
        },
        fail: () => {
          this.setData({ loading: false });
          wx.showToast({ title: "上传失败", icon: "none" });
          resolve();
        }
      });
    });
  },

  onDownload() {
    const { processedUrl } = this.data;
    if (!processedUrl) {
      return;
    }
    wx.downloadFile({
      url: processedUrl,
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: "下载失败", icon: "none" });
          return;
        }
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => wx.showToast({ title: "已保存到相册", icon: "success" }),
          fail: () => wx.showToast({ title: "保存失败", icon: "none" })
        });
      },
      fail: () => wx.showToast({ title: "下载失败", icon: "none" })
    });
  }
});
