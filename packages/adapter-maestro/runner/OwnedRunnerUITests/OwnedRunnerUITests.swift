import XCTest

private struct OwnedRunnerResult: Codable {
  let commandId: String
  let status: String
  let reasonCode: String
  let durationMs: Int
  let data: [String: String]
  let artifacts: [String]
  let message: String?
}

private struct OwnedRunnerHierarchyNode: Codable {
  let type: String
  let identifier: String?
  let AXLabel: String?
  let title: String?
  let AXValue: String?
  let frame: OwnedRunnerFrame
  let enabled: Bool
  let custom_actions: [String]
  let children: [OwnedRunnerHierarchyNode]
}

private let defaultHierarchyMaxNodes = 500
private let hardHierarchyMaxNodes = 1000
private let defaultHierarchyMaxDepth = 8
private let hardHierarchyMaxDepth = 12

private struct OwnedRunnerFrame: Codable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

private func currentCommandId() -> String {
  return ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_COMMAND_ID"] ?? "legacy"
}

private func emitOwnedRunnerResult(_ result: OwnedRunnerResult) {
  let encoder = JSONEncoder()
  if let data = try? encoder.encode(result), let json = String(data: data, encoding: .utf8) {
    print("MOBILE_E2E_OWNED_RUNNER_RESULT=\(json)")
  }
}

private func elementTypeName(_ type: XCUIElement.ElementType) -> String {
  switch type {
  case .application: return "Application"
  case .window: return "Window"
  case .button: return "Button"
  case .cell: return "Cell"
  case .staticText: return "StaticText"
  case .textField: return "TextField"
  case .secureTextField: return "SecureTextField"
  case .textView: return "TextView"
  case .image: return "Image"
  case .link: return "Link"
  case .switch: return "Switch"
  case .slider: return "Slider"
  case .table: return "Table"
  case .collectionView: return "CollectionView"
  case .scrollView: return "ScrollView"
  case .navigationBar: return "NavigationBar"
  case .tabBar: return "TabBar"
  case .toolbar: return "Toolbar"
  case .searchField: return "SearchField"
  default: return "Other"
  }
}

private func isDefaultActionElement(_ element: XCUIElement) -> Bool {
  switch element.elementType {
  case .button, .cell, .link, .switch, .slider:
    return true
  default:
    return false
  }
}

private func boundedEnvironmentInt(_ key: String, defaultValue: Int, minimum: Int, maximum: Int) -> Int {
  guard let rawValue = ProcessInfo.processInfo.environment[key], let parsedValue = Int(rawValue) else {
    return defaultValue
  }
  return min(max(parsedValue, minimum), maximum)
}

private func buildHierarchyNode(_ element: XCUIElement, depth: Int, maxDepth: Int, remainingNodes: inout Int) -> OwnedRunnerHierarchyNode {
  remainingNodes -= 1
  let frame = element.frame
  let childElements = depth < maxDepth && remainingNodes > 0
    ? element.children(matching: .any).allElementsBoundByIndex
    : []
  var children: [OwnedRunnerHierarchyNode] = []
  for child in childElements where remainingNodes > 0 {
    children.append(buildHierarchyNode(child, depth: depth + 1, maxDepth: maxDepth, remainingNodes: &remainingNodes))
  }
  let value = element.value.map { String(describing: $0) }
  return OwnedRunnerHierarchyNode(
    type: elementTypeName(element.elementType),
    identifier: element.identifier.isEmpty ? nil : element.identifier,
    AXLabel: element.label.isEmpty ? nil : element.label,
    title: element.label.isEmpty ? nil : element.label,
    AXValue: value,
    frame: OwnedRunnerFrame(x: frame.origin.x, y: frame.origin.y, width: frame.size.width, height: frame.size.height),
    enabled: element.isEnabled,
    custom_actions: isDefaultActionElement(element) ? ["default"] : [],
    children: children
  )
}

private func hierarchyJson(for targetApp: XCUIApplication) throws -> String {
  var remainingNodes = boundedEnvironmentInt(
    "IOS_OWNED_RUNNER_HIERARCHY_MAX_NODES",
    defaultValue: defaultHierarchyMaxNodes,
    minimum: 1,
    maximum: hardHierarchyMaxNodes
  )
  let maxDepth = boundedEnvironmentInt(
    "IOS_OWNED_RUNNER_HIERARCHY_MAX_DEPTH",
    defaultValue: defaultHierarchyMaxDepth,
    minimum: 1,
    maximum: hardHierarchyMaxDepth
  )
  let root = buildHierarchyNode(targetApp, depth: 0, maxDepth: maxDepth, remainingNodes: &remainingNodes)
  let encoder = JSONEncoder()
  let data = try encoder.encode(root)
  return String(data: data, encoding: .utf8) ?? "{}"
}

final class OwnedRunnerUITests: XCTestCase {
  private let app = XCUIApplication()

  private func launchTargetApplicationIfNeeded() -> XCUIApplication? {
    guard let targetBundleId = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_TARGET_BUNDLE_ID"], !targetBundleId.isEmpty else {
      return nil
    }
    let targetApp = XCUIApplication(bundleIdentifier: targetBundleId)
    if targetApp.state == .runningForeground {
      return targetApp
    }
    if targetApp.state == .runningBackground {
      targetApp.activate()
      if targetApp.wait(for: .runningForeground, timeout: 5) {
        return targetApp
      }
    }
    targetApp.launch()
    _ = targetApp.wait(for: .runningForeground, timeout: 10)
    return targetApp
  }

  private func editableCandidates(in targetApp: XCUIApplication) -> [XCUIElement] {
    let textFields = targetApp.textFields.allElementsBoundByIndex
    let secureTextFields = targetApp.secureTextFields.allElementsBoundByIndex
    let textViews = targetApp.textViews.allElementsBoundByIndex
    return textFields + secureTextFields + textViews
  }

  private func hasVisibleKeyboard(in targetApp: XCUIApplication) -> Bool {
    return targetApp.keyboards.firstMatch.exists || app.keyboards.firstMatch.exists
  }

  private func bestEditableElement(in targetApp: XCUIApplication) -> XCUIElement? {
    let candidates = editableCandidates(in: targetApp).filter { $0.exists && $0.isEnabled }
    if let hittable = candidates.first(where: { $0.isHittable }) {
      return hittable
    }
    if let first = candidates.first {
      return first
    }
    return nil
  }

  override func setUpWithError() throws {
    continueAfterFailure = false
    app.launch()
  }

  func testOwnedRunnerExecutesActionFromEnvironment() throws {
    XCTAssertTrue(app.staticTexts["owned_runner_title"].waitForExistence(timeout: 5))

    let flowPath = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_FLOW_PATH"]
    XCTAssertNotNil(flowPath, "IOS_OWNED_RUNNER_FLOW_PATH must be provided by runtime executor")

    let actionType = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_ACTION_TYPE"]
    XCTAssertNotNil(actionType, "IOS_OWNED_RUNNER_ACTION_TYPE is required")

    if actionType == "tap" {
      guard let xText = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_ACTION_X"],
            let yText = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_ACTION_Y"],
            let x = Double(xText),
            let y = Double(yText) else {
        XCTFail("IOS_OWNED_RUNNER_ACTION_X/Y must be numeric when actionType=tap")
        return
      }

      if let targetApp = launchTargetApplicationIfNeeded() {
        let anchor = targetApp.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let coordinate = anchor.withOffset(CGVector(dx: x, dy: y))
        coordinate.tap()
        emitOwnedRunnerResult(OwnedRunnerResult(
          commandId: currentCommandId(),
          status: "success",
          reasonCode: "OK",
          durationMs: 0,
          data: ["action": "tap", "target": "coordinate"],
          artifacts: [],
          message: nil
        ))
        return
      }

      let tapTarget = app.buttons["owned_runner_tap_target"]
      XCTAssertTrue(tapTarget.waitForExistence(timeout: 5))
      tapTarget.tap()
      XCTAssertEqual(app.staticTexts["owned_runner_status"].label, "tap_executed")
      emitOwnedRunnerResult(OwnedRunnerResult(
        commandId: currentCommandId(),
        status: "success",
        reasonCode: "OK",
        durationMs: 0,
        data: ["action": "tap", "target": "owned_runner_tap_target"],
        artifacts: [],
        message: nil
      ))
      return
    }

    if actionType == "type_text" {
      guard let value = ProcessInfo.processInfo.environment["IOS_OWNED_RUNNER_ACTION_TEXT"] else {
        XCTFail("IOS_OWNED_RUNNER_ACTION_TEXT is required when actionType=type_text")
        return
      }
      if value.isEmpty {
        XCTFail("IOS_OWNED_RUNNER_ACTION_TEXT must not be empty when actionType=type_text")
        return
      }
      if let targetApp = launchTargetApplicationIfNeeded() {
        if hasVisibleKeyboard(in: targetApp) {
          targetApp.typeText(value)
          emitOwnedRunnerResult(OwnedRunnerResult(
            commandId: currentCommandId(),
            status: "success",
            reasonCode: "OK",
            durationMs: 0,
            data: ["action": "type_text", "target": "focused_keyboard"],
            artifacts: [],
            message: nil
          ))
          return
        }
        guard let editable = bestEditableElement(in: targetApp) else {
          XCTFail("No editable element found in target app for actionType=type_text")
          return
        }
        editable.tap()
        XCTAssertTrue(hasVisibleKeyboard(in: targetApp), "Keyboard did not appear after focusing editable element")
        editable.typeText(value)
        emitOwnedRunnerResult(OwnedRunnerResult(
          commandId: currentCommandId(),
          status: "success",
          reasonCode: "OK",
          durationMs: 0,
          data: ["action": "type_text", "target": "editable"],
          artifacts: [],
          message: nil
        ))
        return
      }

      let input = app.textFields["owned_runner_input"]
      XCTAssertTrue(input.waitForExistence(timeout: 5))
      input.tap()
      input.typeText(value)
      XCTAssertEqual(input.value as? String, value)
      emitOwnedRunnerResult(OwnedRunnerResult(
        commandId: currentCommandId(),
        status: "success",
        reasonCode: "OK",
        durationMs: 0,
        data: ["action": "type_text", "target": "owned_runner_input"],
        artifacts: [],
        message: nil
      ))
      return
    }

    if actionType == "hierarchy" {
      let targetApp = launchTargetApplicationIfNeeded() ?? app
      do {
        let json = try hierarchyJson(for: targetApp)
        emitOwnedRunnerResult(OwnedRunnerResult(
          commandId: currentCommandId(),
          status: "success",
          reasonCode: "OK",
          durationMs: 0,
          data: ["action": "hierarchy", "hierarchyJson": json],
          artifacts: [],
          message: nil
        ))
      } catch {
        emitOwnedRunnerResult(OwnedRunnerResult(
          commandId: currentCommandId(),
          status: "failed",
          reasonCode: "ADAPTER_ERROR",
          durationMs: 0,
          data: ["action": "hierarchy"],
          artifacts: [],
          message: "Failed to encode hierarchy: \(error)"
        ))
        XCTFail("Failed to encode hierarchy: \(error)")
      }
      return
    }

    emitOwnedRunnerResult(OwnedRunnerResult(
      commandId: currentCommandId(),
      status: "failed",
      reasonCode: "ACTION_TYPE_FAILED",
      durationMs: 0,
      data: ["action": actionType ?? "<nil>"],
      artifacts: [],
      message: "Unsupported IOS_OWNED_RUNNER_ACTION_TYPE"
    ))
    XCTFail("Unsupported IOS_OWNED_RUNNER_ACTION_TYPE: \(actionType ?? "<nil>")")
  }
}
