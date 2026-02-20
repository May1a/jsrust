fn print_str_slice(s: &str) {
    println!("{}", s);
}

#[test]
fn test_example() {
    let hello_world = "Hello, world!";
    print_str_slice(hello_world);
}
