# Native Harness 进展记录（中文版）

## 当前结论

Mobitru native 双端项目，现在已经不只是“项目自带原生测试能跑”，而是：

- **Android：自有 harness 登录 flow 已通过**
- **iOS：自有 harness baseline flow 已通过**
- **iOS：自有 harness 输入型登录 flow 也已通过**

这意味着当前工具已经具备在真实 native 项目上执行以下能力：

1. app 启动
2. 文本输入
3. 密码输入
4. 点击按钮
5. 页面跳转断言

---

## Android 已验证的自有 flow

- `flows/native/mobitru-android-login.yaml`

已验证：

- `login_email`
- `login_password`
- `login_signin`
- `category`

---

## iOS 已验证的自有 flow

### baseline flow

- `flows/native/mobitru-ios-baseline.yaml`

作用：

- 验证点击快捷登录入口后能稳定到达首页

### 输入型 flow

- `flows/native/mobitru-ios-login.yaml`

稳定化后的关键点：

1. `launchApp` 时清理 state / keychain
2. 不在邮箱输入后立即 hide keyboard
3. 在密码输入后再 hide keyboard
4. 根据当前页面状态自适应判断是否已到商品页

---

## 这代表什么

这说明当前项目已经完成从：

- RN sample 验证
- native 项目 onboarding
- native 自有 harness 落地

的连续推进。

---

## 下一步（Flutter）

Flutter demo 已经完成结构摸底：

- 项目：`examples/demo-flutter-app`
- Android package: `com.epam.mobitru`
- iOS bundle: `com.epam.mobitru.demoapp`
- 候选黄金链路：登录成功路径 / 完整下单路径

最合理的下一步是先挑 **Flutter 登录黄金链路** 做第一轮 harness onboarding。
