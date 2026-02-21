
#[test]
fn test_vec() {
    let v = vec![1, 2, 3];
    assert_eq!(v.len(), 3);
    assert_eq!(v.capacity(), 4);
    v.push(4);
    assert_eq!(v.len(), 4);
    assert_eq!(v.capacity(), 4);
    assert_eq!(v.get(2), 3);
    assert_eq!(v[1], 2);
    assert_eq!(v.pop(), 4);
    assert_eq!(v.len(), 3);
}
