fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());

    if profile == "release" {
        match target_os.as_str() {
            "macos" => {
                println!("cargo:rustc-cfg=feature=\"macos-default\"");
            }
            "windows" => {
                println!("cargo:rustc-cfg=feature=\"windows-default\"");
            }
            _ => {}
        }
    }

    // Embed Netis API key from environment variable at compile time
    // Falls back to a placeholder if not set (for development builds)
    let netis_api_key = std::env::var("NETIS_API_KEY")
        .unwrap_or_else(|_| "sk-418Nlx53Dvu87o-TWOgyJg".to_string());
    println!("cargo:rustc-env=NETIS_API_KEY={}", netis_api_key);

    tauri_build::build()
}
