import type { ThemeConfig } from 'antd';

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#276749',
    colorInfo: '#276749',
    colorSuccess: '#276749',
    colorWarning: '#c36a36',
    colorText: '#1c2d27',
    colorTextSecondary: '#65756e',
    colorBgBase: '#ffffff',
    colorBgLayout: '#f5f7f4',
    colorBorder: '#dde4de',
    fontFamily: "Inter, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    borderRadius: 12,
    controlHeight: 42,
    fontSize: 14
  },
  components: {
    Button: { primaryShadow: '0 5px 14px rgba(39,103,73,.16)', fontWeight: 600 },
    Card: { borderRadiusLG: 18 },
    Alert: { colorInfoBg: '#ffffff', colorInfoBorder: '#e3e9e5', colorWarningBg: '#fffaf0', colorWarningBorder: '#f0e5ce', colorSuccessBg: '#f4faf5', colorSuccessBorder: '#dcebdd' },
    Menu: { itemBorderRadius: 10 },
    Select: {
      optionActiveBg: '#f8faf8',
      optionSelectedBg: '#f4f8f5',
      controlItemBgActiveHover: '#eef5ef',
      optionSelectedColor: '#173f35',
      optionSelectedFontWeight: 500
    },
    Tabs: { itemSelectedColor: '#276749', inkBarColor: '#276749' }
  }
};
