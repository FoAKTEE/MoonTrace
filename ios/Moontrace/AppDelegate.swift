import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = Night.color
        window.rootViewController = ViewController()
        window.overrideUserInterfaceStyle = .dark
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

enum Night {
    static let color = UIColor(red: 15 / 255, green: 19 / 255, blue: 32 / 255, alpha: 1)
}
