
#[test]
fn test_vec() {
    let v = vec![1, 2, 3];
    assert_eq!(v.len(), 3);
    assert_eq!(v.capacity(), 4);
    v.push(4);
    assert_eq!(v.len(), 4);
    assert_eq!(v.capacity(), 4);

    let got = v.get(2);
    assert_eq!(got, Some(3));
    assert_eq!(Some(3), Some(3));
    let none_i32: Option<i32> = None;
    let none_i32_rhs: Option<i32> = None;
    assert_eq!(none_i32, none_i32_rhs);

    assert_eq!(v[1], 2);

    assert_eq!(v.pop(), Some(4));
    assert_eq!(v.len(), 3);
}
