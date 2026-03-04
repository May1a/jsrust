// TODO: change test
// This is a duplicate of 11_functions_print.rs

fn print_str_slice(s: &str) {
    println!("{}", s);
}

#[test]
fn test_example() {
    let hello_world = "Hello, world!";
    print_str_slice(hello_world);
}
