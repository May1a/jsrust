
#[test]
fn test_example() {
    let x = 10;
    let r = &x;
    let y = *r;
    assert_eq!(y, x);
}
