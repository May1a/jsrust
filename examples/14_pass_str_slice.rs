fn print_str_slice(s: &str) {
    println!("{}", s);
}

fn main() {
    let hello_world = "Hello, world!";
    print_str_slice(hello_world);
}