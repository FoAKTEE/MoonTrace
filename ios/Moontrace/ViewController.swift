import UIKit
import WebKit

/// Serves the bundled web app from a private `moontrace://app/` origin so WKWebView
/// treats it like a normal site: localStorage persists, no file:// quirks, no network.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    private let mime: [String: String] = [
        "html": "text/html", "js": "application/javascript", "css": "text/css",
        "json": "application/json", "webmanifest": "application/manifest+json",
        "png": "image/png", "svg": "image/svg+xml", "ico": "image/x-icon",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = (path as NSString).lastPathComponent as NSString
        let base = file.deletingPathExtension
        let ext = file.pathExtension
        guard let fileURL = Bundle.main.url(forResource: base, withExtension: ext, subdirectory: "www"),
              let data = try? Data(contentsOf: fileURL),
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
                  "Content-Type": "\(mime[ext] ?? "application/octet-stream"); charset=utf-8",
                  "Content-Length": String(data.count),
                  "Cache-Control": "no-cache",
              ]) else {
            if let notFound = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil) {
                task.didReceive(notFound)
            }
            task.didFinish()
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var web: WKWebView!

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Night.color

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: "moontrace")
        config.userContentController.add(self, name: "moontrace")
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = .default()

        web = WKWebView(frame: view.bounds, configuration: config)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.isOpaque = false
        web.backgroundColor = Night.color
        web.scrollView.backgroundColor = Night.color
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        web.navigationDelegate = self
        web.uiDelegate = self
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view.addSubview(web)

        web.load(URLRequest(url: URL(string: "moontrace://app/index.html")!))
    }

    // MARK: Navigation — anything that is not the bundled app opens in Safari.

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        if url.scheme == "moontrace" { decisionHandler(.allow); return }
        if url.scheme == "http" || url.scheme == "https" || url.scheme == "mailto" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        return nil
    }

    // MARK: Export — the page posts {type:"save", name, text}; share sheet lets the user "Save to Files".

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "moontrace",
              let body = message.body as? [String: Any],
              body["type"] as? String == "save",
              let name = body["name"] as? String,
              let text = body["text"] as? String else { return }
        let safeName = name.replacingOccurrences(of: "/", with: "-")
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
        do {
            try text.write(to: fileURL, atomically: true, encoding: .utf8)
        } catch {
            return
        }
        let share = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        if let pop = share.popoverPresentationController {
            pop.sourceView = web
            pop.sourceRect = CGRect(x: web.bounds.midX, y: web.bounds.maxY - 100, width: 1, height: 1)
        }
        present(share, animated: true)
    }
}
