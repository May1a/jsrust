struct S {
    x: i32,
}

fn main() {
    let v = vec![S { x: 1 }];
    let x = v[0].x;
    println!("{}", x);
}
