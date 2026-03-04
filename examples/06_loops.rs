
#[test]
fn test_example() {
    let mut i = 0;
    while i < 3 {
        i += 1;
    }
    assert_eq!(i, 3);
    println!("{}", i);
}
