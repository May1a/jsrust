mod foo {
    pub struct Bar {
        pub x: i32,
    }
}

fn bar(x: foo::Bar) -> i32 {
    x.x
}

#[test]
fn test_example() {
    let x = foo::Bar { x: 1 };
    println!("{}", bar(x));
}
