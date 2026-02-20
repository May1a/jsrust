
const fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[test]
fn test_const_fn() {
    assert_eq!(add(1, 2), 3);
}
