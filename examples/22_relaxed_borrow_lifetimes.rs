fn passthrough<'a>(x: &'a i32) -> &'a i32 {
    x
}

#[test]
fn test_example() {
    let mut value = 1;
    let shared = &value;
    let unique = &mut value;

    let a = *passthrough(shared);
    let b = *unique;
}
