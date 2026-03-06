# Native Onboarding 结果记录（Mobitru）

## 结论

Mobitru native 双端项目已经完成第一轮本机 onboarding 验证，说明当前工具方向具备进入真实 native 项目的基础。

---

## Android 结果

项目：`examples/demo-android-app`

### 已验证

- Gradle 构建可通过
- app APK 可生成
- androidTest APK 可生成
- 登录相关原生 instrumentation 测试可运行

### 关键发现

1. 项目需使用 **JDK 11**，不能直接使用本机默认 JDK 21。
2. `connectedDebugAndroidTest` 受 Gradle 结果解析链影响，会在收尾阶段报 protobuf 相关问题。
3. 直接使用 `adb shell am instrument` 可成功绕过该问题，完成原生测试执行。

### 实际结果

- `LoginViewTests` 通过：**5/5**

---

## iOS 结果

项目：`examples/demo-ios-app`

### 已验证

- Xcode 依赖包可解析
- 在本机 booted simulator 上可直接执行 UI 测试
- Login 相关 XCUITest 可运行

### 实际结果

- `LoginUiTests` 执行成功
- `** TEST SUCCEEDED **`

---

## 这说明了什么

这次验证说明：

1. 这个工具方向不只适用于 RN sample
2. 已经能够进入 native 项目
3. 真正的通用挑战开始从“能不能跑”转移到“如何统一接入、统一报告、统一执行策略”

---

## 下一步最合理的动作

1. 不再只依赖项目自带原生测试
2. 将 Mobitru 的 native 登录黄金链路迁移到我们自己的 harness / policy / report 体系中
3. 建立 native sample 的统一 runner 与结果归档方式
