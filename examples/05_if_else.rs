
#[test]
fn test_example() {
    let x = if true { 1 } else { 2 };
    assert_eq!(x, 1);
    println!("{}", x);
}
