fn main() {
    println!("cargo:rerun-if-changed=src/native_vision.m");
    println!("cargo:rerun-if-changed=src/native_window.m");
    println!("cargo:rerun-if-changed=src/native_app.m");

    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/native_vision.m")
            .file("src/native_window.m")
            .file("src/native_app.m")
            .flag("-mmacosx-version-min=11.0")
            .flag("-Wno-deprecated-declarations")
            .flag("-Wno-unused-variable")
            .compile("native_vision");

        println!("cargo:rustc-link-lib=framework=Vision");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
    }

    tauri_build::build();
}
