
#[test]
fn test_example() {
    // Test basic format string with one placeholder
    println!("Hello, {}!", "World");
    
    // Test format string with multiple placeholders
    println!("{} {}", "Hello", "Rust");
    
    // Test format string with escape sequences
    println!("Use {{}} for placeholders: {}", "example");
    
    // Test format string with no placeholders
    println!("No placeholders here");
}
