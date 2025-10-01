use cidre::{blocks, ns, ns::workspace::notification as wsn, objc::Obj};
use tokio::time::{sleep, Duration};

use crate::BackgroundTask;

// `defaults read /Applications/Hyprnote.app/Contents/Info.plist CFBundleIdentifier`
const MEETING_APP_LIST: [&str; 8] = [
    "us.zoom.xos",                    // Zoom
    "Cisco-Systems.Spark",            // Webex (old bundle ID)
    "com.cisco.webexmeetings",        // Webex
    "com.microsoft.teams",            // Microsoft Teams
    "com.tencent.meeting",            // 腾讯会议 (Tencent Meeting)
    "com.apple.FaceTime",             // FaceTime
    "com.tencent.xinWeChat",          // 微信 (WeChat)
    "com.tencent.WeWorkMac",          // 企业微信 (WeChat Work)
];

pub struct Detector {
    background: BackgroundTask,
}

impl Default for Detector {
    fn default() -> Self {
        Self {
            background: BackgroundTask::default(),
        }
    }
}

impl crate::Observer for Detector {
    fn start(&mut self, f: crate::DetectCallback) {
        self.background.start(|running, mut rx| async move {
            let notification_running = running.clone();
            let callback = f.clone();

            let launch_block = {
                let callback = callback.clone();
                let notification_running = notification_running.clone();
                move |n: &ns::Notification| {
                    if !notification_running.load(std::sync::atomic::Ordering::SeqCst) {
                        return;
                    }

                    let user_info = n.user_info().unwrap();

                    if let Some(app) = user_info.get(wsn::app_key()) {
                        if let Some(app) = app.try_cast(ns::RunningApp::cls()) {
                            if let Some(bundle_id_ns) = app.bundle_id() {
                                let bundle_id = bundle_id_ns.to_string();
                                let detected = MEETING_APP_LIST.contains(&bundle_id.as_str());
                                if detected {
                                    tracing::info!("Meeting app launched: {}", bundle_id);
                                    callback(crate::DetectEvent::MeetingAppStarted(bundle_id));
                                }
                            }
                        }
                    }
                }
            };

            let terminate_block = {
                let callback = callback.clone();
                let notification_running = notification_running.clone();
                move |n: &ns::Notification| {
                    if !notification_running.load(std::sync::atomic::Ordering::SeqCst) {
                        return;
                    }

                    let user_info = n.user_info().unwrap();

                    if let Some(app) = user_info.get(wsn::app_key()) {
                        if let Some(app) = app.try_cast(ns::RunningApp::cls()) {
                            if let Some(bundle_id_ns) = app.bundle_id() {
                                let bundle_id = bundle_id_ns.to_string();
                                let detected = MEETING_APP_LIST.contains(&bundle_id.as_str());
                                if detected {
                                    tracing::info!("Meeting app terminated: {}", bundle_id);
                                    callback(crate::DetectEvent::MeetingAppStopped(bundle_id));
                                }
                            }
                        }
                    }
                }
            };

            let mut launch_block = blocks::SyncBlock::new1(launch_block);
            let mut terminate_block = blocks::SyncBlock::new1(terminate_block);

            let mut observers = Vec::new();
            let mut nc = ns::Workspace::shared().notification_center();

            // Add observer for app launch
            let observer = nc.add_observer_block(wsn::did_launch_app(), None, None, &mut launch_block);
            observers.push(observer);

            // Add observer for app termination
            let observer = nc.add_observer_block(wsn::did_terminate_app(), None, None, &mut terminate_block);
            observers.push(observer);

            loop {
                tokio::select! {
                    _ = &mut rx => {
                        break;
                    }
                    _ = sleep(Duration::from_millis(500)) => {
                        if !running.load(std::sync::atomic::Ordering::SeqCst) {
                            break;
                        }
                    }
                }
            }

            let mut nc = ns::Workspace::shared().notification_center();
            for observer in observers {
                nc.remove_observer(&observer);
            }
        });
    }

    fn stop(&mut self) {
        self.background.stop();
    }
}
