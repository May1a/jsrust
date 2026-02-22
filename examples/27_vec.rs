
#[test]
fn test_vec() {
    let v = vec![1, 2, 3];
    assert_eq!(v.len(), 3);
    assert_eq!(v.capacity(), 4);
    v.push(4);
    assert_eq!(v.len(), 4);
    assert_eq!(v.capacity(), 4);

    let got = match v.get(2) {
        Option::None => -1,
        _ => 3,
    };
    assert_eq!(got, 3);

    let indexed = match v[1] {
        Option::None => -1,
        _ => 2,
    };
    assert_eq!(indexed, 2);

    let popped = match v.pop() {
        Option::None => -1,
        _ => 4,
    };
    assert_eq!(popped, 4);
    assert_eq!(v.len(), 3);
}
