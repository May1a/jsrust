fn id<T>(x: T) -> T {
    x
}

#[test]
fn test_example() {
    println!("{}", id(1));
}
