import type { AutomationScript } from './script';

export const DEFAULT_SCRIPTS: AutomationScript[] = [
  {
    id: 'script-sample-login',
    title: '查找【登录】并点击',
    notes: '利用 Apple Vision 原生 OCR 识别屏幕上的“登录”按钮并自动点击，附带坐标校准',
    config: {
      defaultWaitSeconds: 1.0,
      repeatCount: 1,
      pauseOnFailure: true
    },
    updatedAt: Date.now() - 3600000 * 2,
    actions: [
      {
        id: 'act-ocr-login',
        name: 'OCR 定位并点击【登录】',
        type: 'click_text',
        isEnabled: true,
        isExpanded: false,
        targetText: '登录',
        fuzzyMatch: true,
        offsetX: 0,
        offsetY: 0,
        timeoutSeconds: 5,
        button: 'left',
        customWaitSeconds: 1.5,
        regionScope: { baseType: 'mask', left: 0, right: 200, top: 0, bottom: 300 }
      },
      {
        id: 'act-pos-confirm',
        name: '点击弹窗确认按钮',
        type: 'click_position',
        isEnabled: true,
        isExpanded: false,
        x: 640,
        y: 420,
        button: 'left',
        customWaitSeconds: 1.0,
        regionScope: { baseType: 'mask', left: 0, right: 200, top: 0, bottom: 300 }
      }
    ]
  },
  {
    id: 'script-sample-coord',
    title: '点击坐标 (500, 300)',
    notes: '自动化快速点击固定坐标位置，支持双击及右键操作，精确响应高刷新率屏幕',
    config: {
      defaultWaitSeconds: 1.0,
      repeatCount: 3,
      pauseOnFailure: true
    },
    updatedAt: Date.now() - 3600000 * 5,
    actions: [
      {
        id: 'act-pos-1',
        name: '快速双击目标区域',
        type: 'click_position',
        isEnabled: true,
        isExpanded: false,
        x: 500,
        y: 300,
        button: 'double',
        customWaitSeconds: null,
        regionScope: { baseType: 'mask', left: 0, right: 200, top: 0, bottom: 300 }
      },
      {
        id: 'act-text-verify',
        name: '查找【已完成】文字校验',
        type: 'click_text',
        isEnabled: true,
        isExpanded: false,
        targetText: '已完成',
        fuzzyMatch: false,
        offsetX: 10,
        offsetY: 0,
        timeoutSeconds: 3,
        button: 'left',
        customWaitSeconds: 0.5,
        regionScope: { baseType: 'mask', left: 0, right: 200, top: 0, bottom: 300 }
      }
    ]
  }
];
