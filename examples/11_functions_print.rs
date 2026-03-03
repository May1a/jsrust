
pub fn test(to_print: &str) {
    println!("{}", to_print);
}

#[test]
fn test_example() {
    let hello_world = "Hello, world!";
    test(hello_world);
}
