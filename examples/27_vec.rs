
#[test]
fn test_vec() {
    let v = vec![1, 2, 3];

    v.push(4);
    assert_eq!(v.len(), 4);
}