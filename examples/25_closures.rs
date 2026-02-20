

fn closure_as_parameter(f: fn(x: i32) -> i32) {
    let x = 5;
    let y = f(x);
    assert_eq!(y, 6);
}

#[test]
fn test_closure_as_parameter() {
    let add_one = |z| {
        z + 1
    };
    closure_as_parameter(add_one);
}

#[test]
fn test_closures() {
    let x = 5;
    let add_one = |z| {
        z + x
    };
    let a = 2;
    let y = add_one(a);
    assert_eq!(y, 7);
}