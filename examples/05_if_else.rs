fn passthrough<T>(t: T) -> T {
    t
}

#[test]
fn simple_if() {
    let x = if true { 1 } else { 0 };
    assert_eq!(x, 1);
}

#[test]
fn test_example() {
    let x = if passthrough(false) {
        1
    } else if passthrough(false) == true {
        2
    } else if passthrough(true) {
        3
    } else {
        4
    };
    assert_eq!(x, 3);
    println!("{}", x);
}
